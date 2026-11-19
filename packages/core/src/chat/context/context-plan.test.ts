import { describe, expect, it } from 'vitest';
import type { TurnIntent } from '@wbfm/shared/schemas';
import { buildContextPlan, hasEvidenceCap, isLeanTurn, splitMiddleQuota } from './context-plan';

function intent(over: Partial<TurnIntent> = {}): TurnIntent {
  return {
    kind: 'knowledge',
    confidence: 0.8,
    signals: ['knowledge-question'],
    suggestedTaskMode: false,
    source: 'rule',
    ...over,
  };
}

describe('buildContextPlan（v4.8 意图配额）', () => {
  it('知识问答提高证据配额', () => {
    const plan = buildContextPlan({ intent: intent(), contextWindow: 32_000 });
    expect(plan.quotas.evidence).toBeCloseTo(0.4);
    expect(plan.quotas.tail).toBeCloseTo(0.35);
  });

  it('低置信度回落使用默认 50/35/10 且不限制证据', () => {
    const plan = buildContextPlan({
      intent: intent({ kind: 'chitchat', source: 'fallback', confidence: 0.3 }),
      contextWindow: 32_000,
    });
    expect(plan.quotas.tail).toBeCloseTo(0.5);
    expect(plan.quotas.middle).toBeCloseTo(0.35);
    expect(hasEvidenceCap(plan)).toBe(false);
  });

  it('历史超过 85% 水位时预判压缩', () => {
    const usable = Math.floor(32_000 * 0.9);
    const below = buildContextPlan({
      intent: intent(),
      contextWindow: 32_000,
      estimatedHistoryTokens: Math.floor(usable * 0.5),
    });
    const above = buildContextPlan({
      intent: intent(),
      contextWindow: 32_000,
      estimatedHistoryTokens: Math.floor(usable * 0.9),
    });
    expect(below.preflightCompact).toBe(false);
    expect(above.preflightCompact).toBe(true);
  });

  it('中段配额拆分保持摘要/事实比例', () => {
    const split = splitMiddleQuota(0.35);
    expect(split.summary + split.facts).toBeCloseTo(0.35);
    expect(split.summary).toBeGreaterThan(split.facts);
  });
});

describe('isLeanTurn（轻量回合裁剪）', () => {
  it('高置信度寒暄/澄清走轻量回合', () => {
    expect(isLeanTurn(intent({ kind: 'chitchat', confidence: 0.8 }))).toBe(true);
    expect(isLeanTurn(intent({ kind: 'clarify', confidence: 0.8 }))).toBe(true);
  });

  it('低置信度回落不裁剪（避免误判丢能力）', () => {
    expect(
      isLeanTurn(intent({ kind: 'chitchat', source: 'fallback', confidence: 0.3 })),
    ).toBe(false);
  });

  it('知识问答/工具任务等不裁剪', () => {
    expect(isLeanTurn(intent({ kind: 'knowledge', confidence: 0.9 }))).toBe(false);
    expect(isLeanTurn(intent({ kind: 'tool_task', confidence: 0.9 }))).toBe(false);
    expect(isLeanTurn(intent({ kind: 'follow_up', confidence: 0.9 }))).toBe(false);
  });
});
