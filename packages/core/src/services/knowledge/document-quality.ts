import { DOCUMENT_PARSE_VERSION, type OcrStatus } from '@wbfm/shared/constants';

/** v2.29 P0：文档质量事实（只陈述可核实状态，不做评分） */

export const LOW_CONFIDENCE_TABLE_THRESHOLD = 0.75;

export type DocumentQualityFlag =
  | 'legacy-parse'
  | 'empty-structure'
  | 'missing-source'
  | 'ocr-derived'
  | 'low-confidence-table'
  | 'no-heading';

export interface DocumentQualityTable {
  tableNo: number;
  confidence?: number;
}

export interface DocumentQualityInput {
  parseVersion: number;
  /** 原始文件是否仍保留（重解析的前提） */
  sourceRetained: boolean;
  ocrStatus: OcrStatus | null;
  blocks: ReadonlyArray<{ kind: string; table?: DocumentQualityTable }>;
}

export interface DocumentQualityFacts {
  parseVersion: number;
  pendingReparse: boolean;
  sourceRetained: boolean;
  /** 待重建且缺原始文件：只能重新上传，批量队列会跳过 */
  unrebuildable: boolean;
  flags: DocumentQualityFlag[];
  lowConfidenceTables: number[];
}

export function buildDocumentQualityFacts(input: DocumentQualityInput): DocumentQualityFacts {
  const hasBlocks = input.blocks.length > 0;
  const legacyParse = input.parseVersion < DOCUMENT_PARSE_VERSION;
  const pendingReparse = legacyParse || !hasBlocks;
  const headings = input.blocks.filter((block) => block.kind === 'heading');
  const lowConfidenceTables = input.blocks
    .flatMap((block) => (block.table ? [block.table] : []))
    .filter(
      (table) =>
        table.confidence !== undefined && table.confidence < LOW_CONFIDENCE_TABLE_THRESHOLD,
    )
    .map((table) => table.tableNo);

  const flags: DocumentQualityFlag[] = [];
  if (legacyParse) flags.push('legacy-parse');
  if (!hasBlocks) flags.push('empty-structure');
  if (!input.sourceRetained) flags.push('missing-source');
  if (input.ocrStatus === 'done') flags.push('ocr-derived');
  if (lowConfidenceTables.length > 0) flags.push('low-confidence-table');
  if (hasBlocks && headings.length === 0) flags.push('no-heading');

  return {
    parseVersion: input.parseVersion,
    pendingReparse,
    sourceRetained: input.sourceRetained,
    unrebuildable: pendingReparse && !input.sourceRetained,
    flags,
    lowConfidenceTables,
  };
}
