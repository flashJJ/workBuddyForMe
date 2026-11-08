import { describe, expect, it } from 'vitest';
import { normalizeSummaryFacts, parseSummaryPayload, stripSummaryFence } from './context';

describe('v2.26 P1 摘要 JSON 契约', () => {
  it('解析标准 JSON 载荷（含代码块围栏）', () => {
    const raw = [
      '```json',
      JSON.stringify({
        summary: '用户准备发布 v2.26',
        facts: [{ key: 'budget', value: '5000', unit: '元', validFrom: '2026-03-01' }],
        decisions: ['采用方案 A'],
        open_loops: ['确认上线时间'],
      }),
      '```',
    ].join('\n');
    const payload = parseSummaryPayload(raw)!;
    expect(payload.summary).toBe('用户准备发布 v2.26');
    expect(payload.facts).toEqual([
      { key: 'budget', value: '5000', unit: '元', validFrom: '2026-03-01' },
    ]);
    expect(payload.decisions).toEqual(['采用方案 A']);
    expect(payload.openLoops).toEqual(['确认上线时间']);
  });

  it('模型返回纯文本 → 回退为正文摘要，结构化字段为空', () => {
    const payload = parseSummaryPayload('  用户喜欢喝美式咖啡。  ')!;
    expect(payload.summary).toBe('用户喜欢喝美式咖啡。');
    expect(payload.facts).toEqual([]);
    expect(payload.openLoops).toEqual([]);
  });

  it('JSON 残缺或字段缺失 → 回退纯文本而非抛错', () => {
    expect(parseSummaryPayload('{"summary": ""}')?.summary).toBe('{"summary": ""}');
    expect(parseSummaryPayload('{"facts": []}')?.summary).toBe('{"facts": []}');
    expect(parseSummaryPayload('   ')).toBeNull();
  });

  it('围栏与事实归一化', () => {
    expect(stripSummaryFence('```text\nabc\n```')).toBe('abc');
    expect(
      normalizeSummaryFacts([
        { key: ' budget ', value: ' 5000 ', unit: '  ', validFrom: undefined as unknown as null },
        { key: '  ', value: 'x', unit: null, validFrom: null },
      ]),
    ).toEqual([{ key: 'budget', value: '5000', unit: null, validFrom: null }]);
  });
});
