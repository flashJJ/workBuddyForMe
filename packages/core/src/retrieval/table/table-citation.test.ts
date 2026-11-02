import { describe, expect, it } from 'vitest';
import { formatContextBlock, toCitableChunks, toCitations } from '../context-formatter';
import type { RetrievedChunk } from '../retrieval-service';

const TABLE_CHUNK: RetrievedChunk = {
  documentId: 'd1',
  documentName: '付款计划.md',
  ordinal: 0,
  content: `[合同 › 付款条款]

| 阶段 | 比例 |
| --- | --- |
| 首付 | 30% |
| 尾款 | 70% |`,
  distance: 0,
  sourceUrl: null,
  sectionPath: ['合同', '付款条款'],
  blockKind: 'table',
  tableNo: 1,
  tableRowStart: 1,
  tableRowEnd: 2,
};

describe('表格检索 → 引用（v2.19 M3）', () => {
  it('查询唯一命中行/列时引用到单元格', () => {
    const citation = toCitations(toCitableChunks([TABLE_CHUNK], '首付比例是多少'))[0]!;
    expect(citation).toMatchObject({
      sectionPath: ['合同', '付款条款'],
      tableNo: 1,
      tableRow: 1,
      tableCell: 'B2',
    });
  });

  it('查询无法唯一确定时回落到分片起始行且不带单元格', () => {
    const citation = toCitations(toCitableChunks([TABLE_CHUNK], '比例'))[0]!;
    expect(citation.tableRow).toBe(1);
    expect(citation.tableCell).toBeUndefined();
    const legacy = toCitations(toCitableChunks([TABLE_CHUNK]))[0]!;
    expect(legacy.tableRow).toBe(1);
    expect(legacy.tableCell).toBeUndefined();
  });

  it('资料块抬头带出表/行/单元格，供模型引用', () => {
    const block = formatContextBlock([
      {
        documentName: 'contract.md',
        ordinal: 0,
        content: '| 阶段 | 比例 |',
        staticKind: 'chunk',
        tableNo: 1,
        tableRow: 1,
        tableCell: 'B2',
      },
    ]);
    expect(block).toContain('来源：《contract.md》片段 1 · 表 1 第 1 行 B2');
  });
});
