import type { DocumentRecord } from '@wbfm/shared/types';
import type { StoredDocumentBlock } from '@wbfm/database';
import type { DocumentBlockKind, DocumentTable } from '../../../ingestion/structure';
import { buildDocumentQualityFacts, type DocumentQualityFacts } from '../document-quality';

/** v2.19：结构预览 API 返回（块 id 仅视图层使用，不入库） */
export interface DocumentStructureView {
  documentId: string;
  parsedAt: string | null;
  structureAvailable: boolean;
  pages: Array<{ pageNo: number; blockIds: string[] }>;
  sections: Array<{ path: string[]; blockIds: string[] }>;
  blocks: Array<{
    id: string;
    kind: DocumentBlockKind;
    pageNo: number | null;
    sectionPath: string[];
    content: string;
    charStart: number;
    charEnd: number;
    table?: DocumentTable;
  }>;
  tables: DocumentTable[];
  warnings: string[];
  /** v2.29：待重建 / 缺原始文件 / OCR / 低置信表格等可核实事实 */
  quality: DocumentQualityFacts;
  /** v2.19 M4：是否已配置视觉模型（图表/图片理解按需可用） */
  visionAvailable: boolean;
}

/** v2.29：把结构块投影为页面/章节/表格/警告与质量事实（纯函数，便于单测） */
export function buildDocumentStructureView(input: {
  document: DocumentRecord;
  stored: StoredDocumentBlock[];
  sourceRetained: boolean;
  visionAvailable: boolean;
}): DocumentStructureView {
  const { document, stored } = input;
  const viewBlocks = stored.map((block) => ({
    id: `b${block.ordinal + 1}`,
    kind: block.kind,
    pageNo: block.pageNo,
    sectionPath: block.sectionPath,
    content: block.content,
    charStart: block.charStart,
    charEnd: block.charEnd,
    ...(block.table ? { table: block.table as DocumentTable } : {}),
  }));
  const tables = viewBlocks.flatMap((block) => (block.table ? [block.table] : []));

  const pageMap = new Map<number, string[]>();
  const sectionMap = new Map<string, { path: string[]; blockIds: string[] }>();
  for (const block of viewBlocks) {
    if (block.pageNo !== null) {
      const ids = pageMap.get(block.pageNo) ?? [];
      ids.push(block.id);
      pageMap.set(block.pageNo, ids);
    }
    if (block.sectionPath.length > 0) {
      const key = JSON.stringify(block.sectionPath);
      const section = sectionMap.get(key) ?? { path: block.sectionPath, blockIds: [] };
      section.blockIds.push(block.id);
      sectionMap.set(key, section);
    }
  }

  const warnings: string[] = [];
  if (viewBlocks.length === 0) {
    warnings.push('尚未解析文档结构（旧文档或解析失败）；请重新上传后重建');
  } else {
    if (!viewBlocks.some((block) => block.kind === 'heading')) {
      warnings.push('未检测到标题结构，章节路径为空');
    }
    for (const table of tables) {
      if (table.confidence !== undefined && table.confidence < 0.75) {
        warnings.push(
          `表 ${table.tableNo} 置信度较低（${Math.round(table.confidence * 100)}%），表格结构可能不准确`,
        );
      }
      if (table.header.length === 0) {
        warnings.push(`表 ${table.tableNo} 无表头`);
        continue;
      }
      const mismatch = table.rows.findIndex((row) => row.length !== table.header.length);
      if (mismatch >= 0) {
        warnings.push(`表 ${table.tableNo} 第 ${mismatch + 1} 行单元格数与表头不一致`);
      }
    }
  }
  if (document.ocrStatus === 'done') {
    warnings.push('扫描件结构由 OCR 文本启发式重建，表格识别可能不准确');
  }

  return {
    documentId: document.id,
    parsedAt: document.indexedAt ?? document.createdAt,
    structureAvailable: viewBlocks.length > 0,
    pages: [...pageMap.entries()]
      .sort(([left], [right]) => left - right)
      .map(([pageNo, blockIds]) => ({ pageNo, blockIds })),
    sections: [...sectionMap.values()],
    blocks: viewBlocks,
    tables,
    warnings,
    quality: buildDocumentQualityFacts({
      parseVersion: document.parseVersion,
      sourceRetained: input.sourceRetained,
      ocrStatus: document.ocrStatus,
      blocks: stored.map((block) => ({
        kind: block.kind,
        ...(block.table ? { table: block.table } : {}),
      })),
    }),
    visionAvailable: input.visionAvailable,
  };
}
