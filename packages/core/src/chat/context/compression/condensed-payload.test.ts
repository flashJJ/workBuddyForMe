import { describe, expect, it } from 'vitest';
import type { ContextCondensedPayload } from '@wbfm/shared/schemas';
import { clipCondensedPayload } from './condensed-payload';

function payload(overrides: Partial<ContextCondensedPayload> = {}): ContextCondensedPayload {
  return {
    trigger: 'threshold',
    foldedMessageIds: ['m1'],
    summary: '摘要',
    facts: [{ key: 'k', value: 'v' }],
    decisions: ['d'],
    openLoops: ['o'],
    beforeTokens: 100,
    afterTokens: 50,
    fidelityMissing: [],
    degraded: false,
    ...overrides,
  };
}

describe('clipCondensedPayload（事件契约上限）', () => {
  it('合法载荷原样保留', () => {
    expect(clipCondensedPayload(payload())).toEqual(payload());
  });

  it('超限数组与长文本被裁到 schema 上限', () => {
    const clipped = clipCondensedPayload(
      payload({
        summary: 'x'.repeat(9_000),
        foldedMessageIds: Array.from({ length: 600 }, (_, i) => `m${i}`),
        facts: Array.from({ length: 30 }, (_, i) => ({ key: `k${i}`.repeat(50), value: 'v'.repeat(500) })),
        decisions: Array.from({ length: 12 }, () => 'd'.repeat(400)),
        openLoops: Array.from({ length: 12 }, () => 'o'.repeat(400)),
        fidelityMissing: Array.from({ length: 38 }, (_, i) => `f${i}`),
      }),
    );
    expect(clipped.summary).toHaveLength(8_000);
    expect(clipped.foldedMessageIds).toHaveLength(500);
    expect(clipped.facts).toHaveLength(20);
    expect(clipped.facts[0]!.key).toHaveLength(80);
    expect(clipped.facts[0]!.value).toHaveLength(400);
    expect(clipped.decisions).toHaveLength(10);
    expect(clipped.decisions[0]).toHaveLength(300);
    expect(clipped.openLoops).toHaveLength(10);
    expect(clipped.fidelityMissing).toHaveLength(20);
  });
});
