import { describe, expect, it } from 'vitest';
import { summarizeContextEvents, type ContextEventItem } from './context-events';

function item(type: string, payload: unknown, id = type): ContextEventItem {
  return { id, type, at: '2026-01-01T00:00:00.000Z', payload };
}

const intent = {
  kind: 'follow_up',
  confidence: 0.8,
  signals: ['follow-up-reference'],
  suggestedTaskMode: false,
  source: 'rule',
};

const snapshot = {
  intent,
  contextWindow: 32_000,
  usableWindow: 28_800,
  systemTokens: 2_000,
  toolsTokens: 500,
  reserveTokens: 2_048,
  historyBudget: 14_400,
  historyTokens: 9_000,
  keptMessages: 12,
  droppedMessages: 3,
  truncated: true,
};

const condensed = {
  trigger: 'preflight',
  foldedMessageIds: ['m1', 'm2'],
  summary: '早期摘要',
  facts: [],
  decisions: [],
  openLoops: [],
  beforeTokens: 15_000,
  afterTokens: 8_000,
  fidelityMissing: [],
  degraded: false,
};

describe('summarizeContextEvents（v4.8 上下文面板）', () => {
  it('取最近意图与快照，压缩按时间倒序', () => {
    const data = summarizeContextEvents([
      item('turn_intent', { ...intent, kind: 'chitchat', confidence: 0.4 }, 'i1'),
      item('turn_intent', intent, 'i2'),
      item('context_condensed', condensed, 'c1'),
      item('context_snapshot', snapshot, 's1'),
      item('context_condensed', { ...condensed, trigger: 'threshold' }, 'c2'),
    ]);
    expect(data.intent?.value.kind).toBe('follow_up');
    expect(data.snapshot?.value.contextWindow).toBe(32_000);
    expect(data.compactions.map((entry) => entry.id)).toEqual(['c2', 'c1']);
  });

  it('非法载荷被忽略，空输入返回空结果', () => {
    expect(summarizeContextEvents([])).toEqual({ intent: null, snapshot: null, compactions: [] });
    const data = summarizeContextEvents([
      item('turn_intent', { kind: 'unknown' }),
      item('context_snapshot', { contextWindow: 'bad' }),
      item('context_condensed', { trigger: 'nope' }),
      item('message_started', { content: 'hi' }),
    ]);
    expect(data).toEqual({ intent: null, snapshot: null, compactions: [] });
  });

  it('真机超限载荷（保真项 38 条 / 摘要超长）先裁剪再展示', () => {
    const data = summarizeContextEvents([
      item('context_condensed', {
        ...condensed,
        trigger: 'model_change',
        summary: 'x'.repeat(9_000),
        fidelityMissing: Array.from({ length: 38 }, (_, i) => `f${i}`),
      }),
    ]);
    expect(data.compactions).toHaveLength(1);
    expect(data.compactions[0]!.value.summary).toHaveLength(8_000);
    expect(data.compactions[0]!.value.fidelityMissing).toHaveLength(20);
  });

  it('保留任务模式建议与主智能体提示状态（v4.12）', () => {
    const data = summarizeContextEvents([
      item('turn_intent', {
        ...intent,
        kind: 'tool_task',
        confidence: 0.9,
        suggestedTaskMode: true,
        hintApplied: true,
      }),
    ]);
    expect(data.intent?.value.suggestedTaskMode).toBe(true);
    expect(data.intent?.value.hintApplied).toBe(true);
  });
});
