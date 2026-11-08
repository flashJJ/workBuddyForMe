import { describe, expect, it } from 'vitest';
import {
  appendSnippets,
  checkSummaryFidelity,
  collectSourceSnippets,
  extractNumericTokens,
  normalizeForFidelity,
} from '../summary-fidelity';
import type { SummaryPayload } from '@wbfm/shared/schemas';

const empty = (summary: string): SummaryPayload => ({
  summary,
  facts: [],
  decisions: [],
  openLoops: [],
});

describe('v2.26 P1 摘要数字/日期保真', () => {
  it('抽取金额、百分比、日期与时间并归一化写法', () => {
    const tokens = extractNumericTokens('预算 5000 元，涨幅 12.5%，3月1日 14:30 发布，版本 v2.26');
    expect(tokens).toContain('5000元');
    expect(tokens).toContain('12.5%');
    expect(tokens).toContain('3-1');
    expect(tokens).toContain('14:30');
    expect(normalizeForFidelity('2026年3月1日 / 5,000 元')).toBe('2026-3-1 - 5000元');
  });

  it('摘要与 facts 保留数字 → 校验通过', () => {
    const payload: SummaryPayload = {
      summary: '客户预算 5000 元，3月1日 发布',
      facts: [],
      decisions: [],
      openLoops: [],
    };
    expect(checkSummaryFidelity(payload, '客户说预算 5000 元，3月1日 发布')).toEqual({
      passed: true,
      missing: [],
    });
  });

  it('数字只出现在 facts 中同样视为保留', () => {
    const payload: SummaryPayload = {
      summary: '预算已确认',
      facts: [{ key: 'budget', value: '5000', unit: '元', validFrom: '2026-03-01' }],
      decisions: [],
      openLoops: [],
    };
    expect(checkSummaryFidelity(payload, '预算 5000 元，2026年3月1日确认').passed).toBe(true);
  });

  it('摘要丢失关键数字 → 报告缺失并可取原文片段兜底', () => {
    const source = '用户：预算 5000 元\n助手：好的\n用户：会期定在 3月1日';
    const result = checkSummaryFidelity(empty('用户确认了预算和会期'), source);
    expect(result.passed).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(['5000元', '3-1']));

    const snippets = collectSourceSnippets(source, result.missing);
    expect(snippets).toContain('预算 5000 元');
    expect(snippets).toContain('3月1日');
    expect(appendSnippets('摘要正文', snippets)).toContain('【原文片段】');
  });

  it('无数字/日期的对话不触发保真重试', () => {
    expect(checkSummaryFidelity(empty('用户喜欢美式咖啡'), '用户：我喜欢美式咖啡')).toEqual({
      passed: true,
      missing: [],
    });
  });
});
