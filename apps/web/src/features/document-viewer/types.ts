/** v2.19 M4：文档结构查看器的引用定位目标（字段与 Citation 同名） */
export interface DocumentViewerFocus {
  sectionPath?: string[];
  tableNo?: number;
  tableRow?: number;
  tableCell?: string;
}

export interface DocumentViewerFigure {
  blockId: string;
  caption: string;
  pageNo: number | null;
}

/** 章节路径对比：空路径视为同一「未分章」组 */
export function sameSectionPath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((part, index) => part === b[index]);
}
