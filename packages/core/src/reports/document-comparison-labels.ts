/** v2.19 M3：跨文档对比产物的固定文案（报告正文随 locale 切换） */

export interface ComparisonLabels {
  title: string;
  generatedAt: string;
  left: string;
  right: string;
  sections: string;
  tables: string;
  sectionCompare: string;
  tableCompare: string;
  section: string;
  status: string;
  shared: string;
  leftOnly: string;
  rightOnly: string;
  tableName: string;
  tableLeft: string;
  tableRight: string;
  header: string;
  headerSame: string;
  headerDiff: string;
  rows: string;
  rowLabels: string;
  sharedLabels: string;
  leftOnlyRows: string;
  rightOnlyRows: string;
  none: string;
  unmatched: string;
  leftOnlyTables: string;
  rightOnlyTables: string;
  warnings: string;
  noStructureBoth: string;
  noStructureLeft: string;
  noStructureRight: string;
  leftWarning: string;
  rightWarning: string;
  emptySections: string;
  emptyTables: string;
}

const zh: ComparisonLabels = {
  title: '文档对比',
  generatedAt: '生成时间',
  left: '左侧',
  right: '右侧',
  sections: '章节',
  tables: '表格',
  sectionCompare: '章节对比',
  tableCompare: '表格对比',
  section: '章节',
  status: '状态',
  shared: '共有',
  leftOnly: '仅左',
  rightOnly: '仅右',
  tableName: '表',
  tableLeft: '左侧表',
  tableRight: '右侧表',
  header: '表头',
  headerSame: '一致',
  headerDiff: '不同',
  rows: '行数（左/右）',
  rowLabels: '行标签差异',
  sharedLabels: '共有',
  leftOnlyRows: '仅左侧的行',
  rightOnlyRows: '仅右侧的行',
  none: '无',
  unmatched: '未匹配表格',
  leftOnlyTables: '仅左侧的表',
  rightOnlyTables: '仅右侧的表',
  warnings: '解析警告',
  noStructureBoth: '两侧文档均未解析结构，无法对比章节与表格',
  noStructureLeft: '左侧文档尚未解析结构（旧文档或解析失败）',
  noStructureRight: '右侧文档尚未解析结构（旧文档或解析失败）',
  leftWarning: '左侧解析警告：',
  rightWarning: '右侧解析警告：',
  emptySections: '（未识别到章节）',
  emptyTables: '（未识别到表格）',
};

const en: ComparisonLabels = {
  title: 'Document comparison',
  generatedAt: 'Generated at',
  left: 'Left',
  right: 'Right',
  sections: 'Sections',
  tables: 'Tables',
  sectionCompare: 'Section comparison',
  tableCompare: 'Table comparison',
  section: 'Section',
  status: 'Status',
  shared: 'Shared',
  leftOnly: 'Left only',
  rightOnly: 'Right only',
  tableName: 'Table',
  tableLeft: 'Left table',
  tableRight: 'Right table',
  header: 'Header',
  headerSame: 'same',
  headerDiff: 'different',
  rows: 'Rows (left/right)',
  rowLabels: 'Row label differences',
  sharedLabels: 'shared',
  leftOnlyRows: 'Rows only on the left',
  rightOnlyRows: 'Rows only on the right',
  none: 'None',
  unmatched: 'Unmatched tables',
  leftOnlyTables: 'Tables only on the left',
  rightOnlyTables: 'Tables only on the right',
  warnings: 'Parse warnings',
  noStructureBoth: 'Neither document has parsed structure; sections and tables cannot be compared',
  noStructureLeft: 'The left document has no parsed structure (legacy document or parse failure)',
  noStructureRight: 'The right document has no parsed structure (legacy document or parse failure)',
  leftWarning: 'Left parse warning: ',
  rightWarning: 'Right parse warning: ',
  emptySections: '(no sections detected)',
  emptyTables: '(no tables detected)',
};

export const COMPARISON_LABELS: Record<'zh' | 'en', ComparisonLabels> = { zh, en };
