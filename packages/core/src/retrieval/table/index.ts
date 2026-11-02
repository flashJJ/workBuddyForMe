/** @子域 barrel 表格问答：意图识别、Markdown 表格解析与单元格定位 */
export { detectTableIntent, type TableIntent } from './table-intent';
export {
  columnIndex,
  columnLetter,
  locateTableCell,
  locateTableCellInChunk,
  parseMarkdownTable,
  type ParsedMarkdownTable,
  type TableCellLocation,
} from './table-cell';
