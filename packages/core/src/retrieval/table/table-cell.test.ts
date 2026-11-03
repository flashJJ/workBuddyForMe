import { describe, expect, it } from 'vitest';
import {
  columnIndex,
  columnLetter,
  locateTableCell,
  locateTableCellInChunk,
  parseMarkdownTable,
} from './table-cell';

const CONTRACT = `[合同 › 付款条款]

| 阶段 | 比例 |
| --- | --- |
| 首付 | 30% |
| 尾款 | 70% |`;

describe('parseMarkdownTable（v2.19）', () => {
  it('跳过章节前缀，识别表头与数据行', () => {
    expect(parseMarkdownTable(CONTRACT)).toEqual({
      header: ['阶段', '比例'],
      rows: [
        ['首付', '30%'],
        ['尾款', '70%'],
      ],
    });
  });

  it('无表头的表格只返回数据行', () => {
    expect(parseMarkdownTable('| 首付 | 30% |')).toEqual({
      header: [],
      rows: [['首付', '30%']],
    });
  });

  it('Excel 列名与下标的双向换算', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
    expect(columnIndex('AA')).toBe(26);
    expect(columnIndex('a')).toBe(0);
    expect(columnIndex('1')).toBe(-1);
  });
});

describe('locateTableCell（v2.19 单元格定位）', () => {
  it('表头 + 行标签唯一命中：返回交叉单元格（表头占 Excel 第 1 行）', () => {
    expect(locateTableCell(CONTRACT, '首付比例是多少')).toMatchObject({
      row: 1,
      column: 1,
      cell: 'B2',
      value: '30%',
    });
    expect(locateTableCell(CONTRACT, '尾款多少')).toMatchObject({
      row: 2,
      column: 1,
      cell: 'B3',
      value: '70%',
    });
  });

  it('显式行号/列号与 Excel 地址', () => {
    expect(locateTableCell(CONTRACT, '第2行比例')).toMatchObject({ row: 2, cell: 'B3' });
    expect(locateTableCell(CONTRACT, '第二行第二列')).toMatchObject({ row: 2, cell: 'B3' });
    expect(locateTableCell(CONTRACT, 'B3')).toMatchObject({ row: 2, cell: 'B3', value: '70%' });
  });

  it('仅单元格值唯一命中时直接定位', () => {
    expect(locateTableCell(CONTRACT, '30% 是哪个阶段')).toMatchObject({
      row: 1,
      cell: 'B2',
      value: '30%',
    });
  });

  it('行可唯一确定但列不唯一时只给行定位，不编造单元格', () => {
    const wide = `| 阶段 | 首付比例 | 尾款比例 |
| --- | --- | --- |
| 一期 | 30% | 70% |
| 二期 | 20% | 80% |`;
    expect(locateTableCell(wide, '一期')).toMatchObject({
      row: 1,
      column: null,
      cell: null,
    });
  });

  it('无法唯一确定时返回 null', () => {
    expect(locateTableCell(CONTRACT, '比例')).toBeNull();
    expect(locateTableCell(CONTRACT, '没有这个字段')).toBeNull();
    expect(locateTableCell(CONTRACT, '   ')).toBeNull();
  });

  it('超长表格分片按原表行号换算（重复表头占 Excel 第 1 行）', () => {
    const slice = `| 阶段 | 比例 |
| --- | --- |
| 三期 | 40% |`;
    expect(locateTableCell(slice, '三期比例', 3)).toMatchObject({
      row: 3,
      column: 1,
      cell: 'B4',
      value: '40%',
    });
  });

  it('无表头表格按数据行原样换算', () => {
    expect(locateTableCell('| 首付 | 30% |', '首付', 1)).toMatchObject({
      row: 1,
      column: 0,
      cell: 'A1',
    });
  });

  it('非表格分片或无表号不定位', () => {
    expect(locateTableCellInChunk({ content: CONTRACT, blockKind: 'paragraph' }, '首付')).toBeNull();
    expect(
      locateTableCellInChunk({ content: CONTRACT, blockKind: 'table', tableNo: null }, '首付'),
    ).toBeNull();
    expect(
      locateTableCellInChunk(
        { content: CONTRACT, blockKind: 'table', tableNo: 1, tableRowStart: 1 },
        '首付比例',
      ),
    ).toMatchObject({ cell: 'B2' });
  });
});
