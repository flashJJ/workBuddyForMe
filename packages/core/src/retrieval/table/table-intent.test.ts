import { describe, expect, it } from 'vitest';
import { detectTableIntent } from './table-intent';

describe('detectTableIntent（v2.19 表格意图）', () => {
  it('表格/行/列/指标类问题判定为表格意图', () => {
    for (const query of [
      '付款比例是多少',
      '表 2 第 3 行写的什么',
      '请对比两份合同的付款条款',
      '去年 Q4 营收总计多少',
      '这个单元格的值',
      'show the total revenue in table 3',
      'which row has the payment amount',
    ]) {
      expect(detectTableIntent(query).isTableIntent, query).toBe(true);
    }
  });

  it('普通段落问题不误判', () => {
    for (const query of ['表示什么意思', '这个行业的趋势', '如何写周报', '介绍一下公司历史']) {
      expect(detectTableIntent(query).isTableIntent, query).toBe(false);
    }
  });

  it('空查询安全退化', () => {
    expect(detectTableIntent('   ')).toEqual({ isTableIntent: false, matches: [] });
  });

  it('返回命中的词面，便于观测', () => {
    const intent = detectTableIntent('对比表 3 的付款比例');
    expect(intent.matches).toEqual(expect.arrayContaining(['表号', '对比', '指标']));
  });
});
