/** 分片详情查询结果（向量检索/按 id 回查共用） */
export interface ChunkSearchResult {
  chunkId: number;
  documentId: string;
  documentName: string;
  ordinal: number;
  content: string;
  charStart: number;
  charEnd: number;
  /** v1.3：PDF 页码（无则 null） */
  pageNo: number | null;
  /** v1.3：文档内段落序号（无则 null） */
  paragraphNo: number | null;
  distance: number;
  /** v0.3：网页剪藏文档的来源 URL，本地上传文档为 null */
  sourceUrl: string | null;
  /** v2.19：章节路径（旧分片为空数组） */
  sectionPath: string[];
  /** v2.19：结构块类型/表格编号/表格行范围（旧分片为 null） */
  blockKind: string | null;
  tableNo: number | null;
  tableRowStart: number | null;
  tableRowEnd: number | null;
}

export const CHUNK_DETAIL_SELECT = `
  c.id AS chunkId, c.document_id AS documentId, d.filename AS documentName,
  c.ordinal AS ordinal, c.content AS content,
  c.char_start AS charStart, c.char_end AS charEnd,
  c.page_no AS pageNo, c.paragraph_no AS paragraphNo,
  c.section_path AS sectionPath, c.block_kind AS blockKind,
  c.table_no AS tableNo, c.table_row_start AS tableRowStart,
  c.table_row_end AS tableRowEnd,
  d.source_url AS sourceUrl`;

export type RawChunkSearchRow = Omit<ChunkSearchResult, 'sectionPath'> & { sectionPath: string };

function parseSectionPath(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function mapChunkRows(rows: RawChunkSearchRow[]): ChunkSearchResult[] {
  return rows.map((row) => ({ ...row, sectionPath: parseSectionPath(row.sectionPath) }));
}
