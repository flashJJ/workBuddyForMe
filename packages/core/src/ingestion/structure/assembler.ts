import type { StructuredText } from '../text-structure';
import type {
  BlockSegment,
  DocumentBlock,
  DocumentBlockKind,
  DocumentTable,
  ParsedDocument,
} from './types';

const MAX_SECTION_DEPTH = 4;

/** 表格块正文渲染为 Markdown：无表头时只输出数据行 */
export function renderMarkdownTable(table: Omit<DocumentTable, 'tableNo'>): string {
  const header = table.header.map((cell) => cell.trim());
  const rows = table.rows.map((row) => row.map((cell) => cell.trim()));
  const columnCount = Math.max(header.length, ...rows.map((row) => row.length), 0);
  if (columnCount === 0) return '';

  const pad = (cells: string[]) => {
    const filled = [...cells];
    while (filled.length < columnCount) filled.push('');
    return `| ${filled.join(' | ')} |`;
  };

  const lines: string[] = [];
  if (header.length > 0) {
    lines.push(pad(header));
    lines.push(`| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`);
  }
  for (const row of rows) lines.push(pad(row));
  return lines.join('\n');
}

function tableWarnings(tableNo: number, table: DocumentTable): string[] {
  const warnings: string[] = [];
  const expected = table.header.length;
  if (expected === 0) {
    warnings.push(`表 ${tableNo} 无表头，按数据表处理`);
    return warnings;
  }
  const mismatch = table.rows.findIndex((row) => row.length !== expected);
  if (mismatch >= 0) {
    warnings.push(`表 ${tableNo} 第 ${mismatch + 1} 行单元格数与表头不一致`);
  }
  return warnings;
}

/** 将解析片段组装成文本、块坐标、章节路径与表格列表 */
export function assembleDocument(
  segments: readonly BlockSegment[],
  initialWarnings: readonly string[] = [],
): ParsedDocument {
  const warnings = [...initialWarnings];
  const blocks: DocumentBlock[] = [];
  const tables: DocumentTable[] = [];
  const sections: Array<{ level: number; text: string }> = [];
  let text = '';
  let tableNo = 0;
  let sawHeading = false;

  for (const segment of segments) {
    const content =
      segment.kind === 'table' && segment.table
        ? renderMarkdownTable(segment.table)
        : segment.content.trim();
    if (!content) continue;

    if (segment.kind === 'heading') {
      sawHeading = true;
      const level = Math.min(Math.max(segment.headingLevel ?? 1, 1), MAX_SECTION_DEPTH);
      while (sections.length > 0 && sections[sections.length - 1]!.level >= level) {
        sections.pop();
      }
      sections.push({ level, text: content });
    }

    const sectionPath = sections.slice(0, MAX_SECTION_DEPTH).map((item) => item.text);
    if (text.length > 0) text += '\n\n';
    const charStart = text.length;
    text += content;
    const charEnd = text.length;

    let table: DocumentTable | undefined;
    if (segment.kind === 'table' && segment.table) {
      tableNo += 1;
      table = { ...segment.table, tableNo };
      tables.push(table);
      warnings.push(...tableWarnings(tableNo, table));
    }

    blocks.push({
      id: `b${blocks.length + 1}`,
      kind: segment.kind,
      pageNo: segment.pageNo,
      sectionPath,
      content,
      charStart,
      charEnd,
      ...(table ? { table } : {}),
    });
  }

  if (!sawHeading && blocks.length > 0) warnings.push('未检测到标题结构，章节路径为空');

  return { text, blocks, tables, warnings };
}

/** 由既有页/段结构生成纯文本块（结构解析失败或旧调用方兜底） */
export function fallbackParsedDocument(
  structure: StructuredText,
  warnings: readonly string[] = [],
): ParsedDocument {
  const blocks: DocumentBlock[] = structure.blocks.map((block, index) => ({
    id: `b${index + 1}`,
    kind: 'paragraph',
    pageNo: block.pageNo,
    sectionPath: [],
    content: structure.text.slice(block.charStart, block.charEnd),
    charStart: block.charStart,
    charEnd: block.charEnd,
  }));
  return { text: structure.text, blocks, tables: [], warnings: [...warnings] };
}

/** 分块坐标映射沿用的页/段视图；段落序号按结构块顺序编排 */
export function toStructuredText(parsed: ParsedDocument): StructuredText {
  return {
    text: parsed.text,
    blocks: parsed.blocks.map((block, index) => ({
      charStart: block.charStart,
      charEnd: block.charEnd,
      pageNo: block.pageNo,
      paragraphNo: index + 1,
    })),
  };
}

/** chunk 结构列（v043）：章节路径、块类型、表格编号；表格行范围留待 M2 表格分块 */
export interface ChunkStructure {
  sectionPath: string[];
  blockKind: DocumentBlockKind;
  tableNo: number | null;
  tableRowStart: number | null;
  tableRowEnd: number | null;
}

/** 以分片首字符定位所在结构块，取其章节路径/块类型/表号 */
export function mapChunkStructure(
  slices: ReadonlyArray<{ charStart: number }>,
  parsed: ParsedDocument,
): ChunkStructure[] {
  return slices.map((slice) => {
    let found: DocumentBlock | null = null;
    for (const block of parsed.blocks) {
      if (slice.charStart >= block.charStart && slice.charStart < block.charEnd) {
        found = block;
        break;
      }
      if (block.charStart <= slice.charStart) found = block;
    }
    if (!found) {
      return {
        sectionPath: [],
        blockKind: 'paragraph',
        tableNo: null,
        tableRowStart: null,
        tableRowEnd: null,
      };
    }
    return {
      sectionPath: found.sectionPath,
      blockKind: found.kind,
      tableNo: found.table?.tableNo ?? null,
      tableRowStart: null,
      tableRowEnd: null,
    };
  });
}
