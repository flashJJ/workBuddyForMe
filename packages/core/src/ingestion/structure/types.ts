/** v2.19 M1：文档结构契约（与 02-M0 契约冻结一致） */

export type DocumentBlockKind = 'heading' | 'paragraph' | 'list' | 'table' | 'figure';

export interface DocumentTable {
  /** 文档内表格序号，从 1，按出现顺序 */
  tableNo: number;
  /** 表头行；无表头时为空数组 */
  header: string[];
  /** 数据行；每格为纯文本 */
  rows: string[][];
  caption?: string;
  pageNo?: number | null;
  /** v2.19 M5：结构置信度（0-1；OCR/错列/缺表头时降低） */
  confidence?: number;
}

export interface DocumentBlock {
  id: string;
  kind: DocumentBlockKind;
  pageNo: number | null;
  /** 章节路径，最多 4 层；无标题文档为空数组 */
  sectionPath: string[];
  /** 块正文；表格块为 Markdown 表格 */
  content: string;
  charStart: number;
  charEnd: number;
  /** kind=table 时存在 */
  table?: DocumentTable;
}

export interface ParsedDocument {
  text: string;
  blocks: DocumentBlock[];
  tables: DocumentTable[];
  /** 解析警告：低置信表格、OCR 降级、标题缺失等 */
  warnings: string[];
}

/** 解析器内部片段；表格片段由 assembler 统一编号并渲染 */
export interface BlockSegment {
  kind: DocumentBlockKind;
  content: string;
  pageNo: number | null;
  /** 仅 heading 使用，1 为最高层 */
  headingLevel?: number;
  table?: Omit<DocumentTable, 'tableNo'>;
}
