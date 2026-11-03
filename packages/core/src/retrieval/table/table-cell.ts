/**
 * v2.19 M3：表格单元格定位（纯函数）。
 *
 * 表格分片正文是重复表头的 Markdown；根据查询词面在表头/行首标签/单元格值
 * 中选取唯一最佳命中，换算为 Excel 风格地址（表头占第 1 行）。无法唯一确定
 * 时宁可不给单元格，避免制造错误出处；行能确定时仍返回行定位。
 */

import {
  columnIndex,
  columnLetter,
  matchScore,
  parseCount,
  parseMarkdownTable,
  pickBest,
  queryTerms,
} from './table-cell-parse';

export {
  columnIndex,
  columnLetter,
  parseMarkdownTable,
  type ParsedMarkdownTable,
} from './table-cell-parse';

export interface TableCellLocation {
  /** 文档内数据行号（从 1，表头不计） */
  row: number;
  /** 列下标（从 0；无法确定时 null） */
  column: number | null;
  /** Excel 风格地址（如 C3）；无法确定单元格时 null */
  cell: string | null;
  /** 命中的单元格原文（可观测/调试用） */
  value: string | null;
}

const ZH_COUNT = '0-9一二三四五六七八九十';

function bestCellIn(
  rows: readonly string[][],
  rowIndex: number | null,
  columnIndexes: readonly number[],
  terms: readonly string[],
  queryLower: string,
): { rowIndex: number; colIndex: number; value: string } | null {
  const candidates: Array<{ rowIndex: number; colIndex: number; value: string; score: number }> = [];
  rows.forEach((row, r) => {
    if (rowIndex !== null && r !== rowIndex) return;
    for (const c of columnIndexes) {
      if (c >= row.length) continue;
      const value = row[c] ?? '';
      const score = matchScore(value, terms, queryLower);
      if (score > 0) candidates.push({ rowIndex: r, colIndex: c, value, score });
    }
  });
  const best = pickBest(candidates.map((candidate) => candidate.score));
  return best === null ? null : candidates[best]!;
}

/**
 * 在表格分片中定位查询所指的数据行/单元格。
 * rowStart 为该分片第一行在原表中的数据行号（分片重复表头时仍按原表行号）。
 */
export function locateTableCell(
  content: string,
  query: string,
  rowStart: number | null = 1,
): TableCellLocation | null {
  const parsed = parseMarkdownTable(content);
  if (!parsed || parsed.rows.length === 0) return null;
  const trimmed = query.trim();
  if (!trimmed) return null;

  const hasHeader = parsed.header.length > 0;
  const maxColumns = Math.max(parsed.header.length, ...parsed.rows.map((row) => row.length));
  const start = rowStart !== null && rowStart > 0 ? rowStart : 1;
  const queryLower = trimmed.toLowerCase();
  const terms = queryTerms(trimmed);
  const globalRow = (local: number) => start + local;

  const toLocation = (local: number, col: number): TableCellLocation => {
    const dataRow = globalRow(local);
    const excelRow = hasHeader ? dataRow + 1 : dataRow;
    return {
      row: dataRow,
      column: col,
      cell: `${columnLetter(col)}${excelRow}`,
      value: parsed.rows[local]?.[col] ?? null,
    };
  };

  const explicitRow = trimmed.match(new RegExp(`第\\s*([${ZH_COUNT}]+)\\s*行`));
  const explicitColumn = trimmed.match(new RegExp(`第\\s*([${ZH_COUNT}]+)\\s*列`));
  const explicitCell = trimmed.match(/\b([A-Z])([1-9]\d{0,2})\b/);
  const requestedRow = explicitRow ? parseCount(explicitRow[1]!) : null;
  const requestedColumn = explicitColumn ? parseCount(explicitColumn[1]!) : null;

  if (explicitCell) {
    const column = columnIndex(explicitCell[1]!);
    const excelRow = Number(explicitCell[2]);
    const dataRow = hasHeader ? excelRow - 1 : excelRow;
    const local = dataRow - start;
    if (column >= 0 && local >= 0 && local < parsed.rows.length && column < maxColumns) {
      return toLocation(local, column);
    }
  }

  const headerScores = parsed.header.map((cell) => matchScore(cell, terms, queryLower));
  const rowScores = parsed.rows.map((row) => matchScore(row[0] ?? '', terms, queryLower));
  const bestHeader = pickBest(headerScores);
  const bestRowLabel = pickBest(rowScores);
  // 有表头时行首列是标签，只把数据列纳入值命中，避免把「首付」当成单元格答案
  const dataColumnIndexes = Array.from({ length: maxColumns }, (_, i) => i).filter((i) =>
    hasHeader ? i > 0 : true,
  );

  // 未显式指定行/列时，唯一的值命中优先（如「30% 是哪个阶段」）
  if (requestedRow === null && requestedColumn === null) {
    const valueOnly = bestCellIn(parsed.rows, null, dataColumnIndexes, terms, queryLower);
    if (valueOnly) return toLocation(valueOnly.rowIndex, valueOnly.colIndex);
  }

  const rowLocal =
    requestedRow !== null && requestedRow >= start && requestedRow < start + parsed.rows.length
      ? requestedRow - start
      : bestRowLabel;
  const column =
    requestedColumn !== null && requestedColumn > 0 && requestedColumn <= maxColumns
      ? requestedColumn - 1
      : bestHeader;

  if (rowLocal !== null && column !== null && column >= 0) {
    return toLocation(rowLocal, column);
  }

  if (rowLocal !== null) {
    const inRow = bestCellIn(parsed.rows, rowLocal, dataColumnIndexes, terms, queryLower);
    if (inRow) return toLocation(inRow.rowIndex, inRow.colIndex);
    // 只有「行标签 + 一个数据列」时，行命中即可唯一确定单元格
    if (hasHeader && parsed.header.length === 2) return toLocation(rowLocal, 1);
    if (!hasHeader && parsed.rows[rowLocal]!.length === 2) return toLocation(rowLocal, 1);
    if (!hasHeader && parsed.rows[rowLocal]!.length === 1) return toLocation(rowLocal, 0);
    return { row: globalRow(rowLocal), column: null, cell: null, value: null };
  }

  if (column !== null && column >= 0) {
    if (parsed.rows.length === 1) return toLocation(0, column);
    const inColumn = bestCellIn(parsed.rows, null, [column], terms, queryLower);
    if (inColumn) return toLocation(inColumn.rowIndex, inColumn.colIndex);
    return null;
  }

  const valueHit = bestCellIn(parsed.rows, null, dataColumnIndexes, terms, queryLower);
  return valueHit ? toLocation(valueHit.rowIndex, valueHit.colIndex) : null;
}

/** 表格分片入口：非表格分片/无表号直接返回 null */
export function locateTableCellInChunk(
  chunk: {
    content: string;
    blockKind?: string | null;
    tableNo?: number | null;
    tableRowStart?: number | null;
  },
  query: string,
): TableCellLocation | null {
  if (chunk.blockKind !== 'table' || chunk.tableNo === null || chunk.tableNo === undefined) {
    return null;
  }
  return locateTableCell(chunk.content, query, chunk.tableRowStart ?? 1);
}
