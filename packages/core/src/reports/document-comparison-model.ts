import type { DocumentComparisonSummary } from '@wbfm/shared/types';
import type { DocumentTable } from '../ingestion/structure';
import type { ComparisonLabels } from './document-comparison-labels';

/** v2.19 M3：跨文档章节/表格对比模型构建（纯函数，渲染层共用） */

export interface ComparisonDocumentInput {
  documentId: string;
  name: string;
  structureAvailable: boolean;
  sections: ReadonlyArray<{ path: string[] }>;
  tables: ReadonlyArray<DocumentTable>;
  warnings: string[];
}

export interface ComparisonSectionRow {
  path: string;
  inLeft: boolean;
  inRight: boolean;
}

export interface ComparisonTableRow {
  leftLabel: string;
  rightLabel: string;
  headerSame: boolean;
  rowsLeft: number;
  rowsRight: number;
  labelsShared: number;
  labelsLeftOnly: string[];
  labelsRightOnly: string[];
}

export interface DocumentComparisonModel {
  generatedAt: string;
  left: ComparisonDocumentInput;
  right: ComparisonDocumentInput;
  sectionRows: ComparisonSectionRow[];
  tableRows: ComparisonTableRow[];
  unmatchedLeft: string[];
  unmatchedRight: string[];
  warnings: string[];
  summary: DocumentComparisonSummary;
}

function sectionKeys(doc: ComparisonDocumentInput): string[] {
  const keys = new Set<string>();
  for (const section of doc.sections) {
    const key = section.path.filter(Boolean).join(' › ');
    if (key) keys.add(key);
  }
  return [...keys];
}

function tableLabel(table: DocumentTable, labels: ComparisonLabels): string {
  const caption = table.caption?.trim();
  return `${labels.tableName} ${table.tableNo}${caption ? `：${caption}` : ''}`;
}

function headerKey(table: DocumentTable): string {
  return table.header
    .map((cell) => cell.trim().toLowerCase())
    .filter(Boolean)
    .join('|');
}

function tableKey(table: DocumentTable): string {
  return headerKey(table) || (table.caption?.trim() ? `caption:${table.caption.trim().toLowerCase()}` : '');
}

function headerSimilarity(a: DocumentTable, b: DocumentTable): number {
  const left = new Set(a.header.map((cell) => cell.trim().toLowerCase()).filter(Boolean));
  const right = new Set(b.header.map((cell) => cell.trim().toLowerCase()).filter(Boolean));
  if (left.size === 0 || right.size === 0) {
    const leftCaption = a.caption?.trim().toLowerCase() ?? '';
    const rightCaption = b.caption?.trim().toLowerCase() ?? '';
    return leftCaption && leftCaption === rightCaption ? 1 : 0;
  }
  let intersection = 0;
  for (const cell of left) if (right.has(cell)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function rowLabelSet(table: DocumentTable): Set<string> {
  const labels = new Set<string>();
  for (const row of table.rows) {
    const label = (row[0] ?? '').trim();
    if (label) labels.add(label);
  }
  return labels;
}

function buildTableRows(
  left: ComparisonDocumentInput,
  right: ComparisonDocumentInput,
  labels: ComparisonLabels,
): { rows: ComparisonTableRow[]; unmatchedLeft: string[]; unmatchedRight: string[] } {
  const usedRight = new Set<number>();
  const usedLeft = new Set<number>();
  const matched: ComparisonTableRow[] = [];

  for (const [leftIndex, leftTable] of left.tables.entries()) {
    const key = tableKey(leftTable);
    let matchIndex = -1;
    if (key) {
      matchIndex = right.tables.findIndex(
        (table, index) => !usedRight.has(index) && tableKey(table) === key,
      );
    }
    if (matchIndex < 0) {
      let bestScore = 0.6;
      right.tables.forEach((table, index) => {
        if (usedRight.has(index)) return;
        const score = headerSimilarity(leftTable, table);
        if (score >= bestScore) {
          bestScore = score;
          matchIndex = index;
        }
      });
    }
    if (matchIndex < 0) continue;
    usedRight.add(matchIndex);
    usedLeft.add(leftIndex);
    const rightTable = right.tables[matchIndex]!;
    const leftLabels = [...rowLabelSet(leftTable)];
    const rightLabels = [...rowLabelSet(rightTable)];
    const leftSet = rowLabelSet(leftTable);
    const rightSet = rowLabelSet(rightTable);
    matched.push({
      leftLabel: tableLabel(leftTable, labels),
      rightLabel: tableLabel(rightTable, labels),
      headerSame: headerKey(leftTable) === headerKey(rightTable),
      rowsLeft: leftTable.rows.length,
      rowsRight: rightTable.rows.length,
      labelsShared: leftLabels.filter((label) => rightSet.has(label)).length,
      labelsLeftOnly: leftLabels.filter((label) => !rightSet.has(label)),
      labelsRightOnly: rightLabels.filter((label) => !leftSet.has(label)),
    });
  }

  return {
    rows: matched,
    unmatchedLeft: left.tables
      .filter((_table, index) => !usedLeft.has(index))
      .map((table) => tableLabel(table, labels)),
    unmatchedRight: right.tables
      .filter((_table, index) => !usedRight.has(index))
      .map((table) => tableLabel(table, labels)),
  };
}

function buildWarnings(
  left: ComparisonDocumentInput,
  right: ComparisonDocumentInput,
  labels: ComparisonLabels,
): string[] {
  const warnings = new Set<string>();
  if (!left.structureAvailable && !right.structureAvailable) {
    warnings.add(labels.noStructureBoth);
  } else if (!left.structureAvailable) {
    warnings.add(labels.noStructureLeft);
  } else if (!right.structureAvailable) {
    warnings.add(labels.noStructureRight);
  }
  for (const warning of left.warnings) warnings.add(`${labels.leftWarning}${warning}`);
  for (const warning of right.warnings) warnings.add(`${labels.rightWarning}${warning}`);
  return [...warnings];
}

export function buildComparisonModel(
  left: ComparisonDocumentInput,
  right: ComparisonDocumentInput,
  labels: ComparisonLabels,
  generatedAt: string,
): DocumentComparisonModel {
  const leftKeys = sectionKeys(left);
  const rightKeys = sectionKeys(right);
  const leftSet = new Set(leftKeys);
  const rightSet = new Set(rightKeys);
  const sectionRows: ComparisonSectionRow[] = [
    ...leftKeys.map((path) => ({ path, inLeft: true, inRight: rightSet.has(path) })),
    ...rightKeys
      .filter((path) => !leftSet.has(path))
      .map((path) => ({ path, inLeft: false, inRight: true })),
  ];
  const tableResult = buildTableRows(left, right, labels);
  const warnings = buildWarnings(left, right, labels);
  const sharedSections = sectionRows.filter((row) => row.inLeft && row.inRight).length;
  const leftOnlySections = sectionRows.filter((row) => row.inLeft && !row.inRight).length;
  const rightOnlySections = sectionRows.filter((row) => !row.inLeft && row.inRight).length;

  return {
    generatedAt,
    left,
    right,
    sectionRows,
    tableRows: tableResult.rows,
    unmatchedLeft: tableResult.unmatchedLeft,
    unmatchedRight: tableResult.unmatchedRight,
    warnings,
    summary: {
      leftName: left.name,
      rightName: right.name,
      sections: {
        total: sectionRows.length,
        shared: sharedSections,
        leftOnly: leftOnlySections,
        rightOnly: rightOnlySections,
      },
      tables: {
        left: left.tables.length,
        right: right.tables.length,
        matched: tableResult.rows.length,
      },
      warnings,
    },
  };
}
