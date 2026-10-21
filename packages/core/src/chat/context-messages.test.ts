import { describe, expect, it } from 'vitest';
import type { Message } from '@wbfm/shared/types';
import { DEFAULT_CONTEXT_MESSAGES } from '@wbfm/shared/constants';
import { applyContextMessageCap, buildTurnMessages } from './turn-context';
import type { ChatMessage } from '@wbfm/ai';

function makeAssistant() {
  return {
    id: 'a1',
    name: '助手',
    emoji: null,
    color: null,
    systemPrompt: '你是一个简洁的助手。',
    temperature: 1,
    topP: 1,
    maxTokens: null,
    modelId: null,
    plannerModelId: null,
    executorModelId: null,
    reviewerModelId: null,
    knowledgeBaseIds: [],
    enabledTools: [],
    skillNames: [],
    retrieveAlways: true,
    memoryEnabled: true,
    expressionEnabled: false,
    personalityFrankness: 0.5,
    personalityTsundere: 0.5,
    personalityShy: 0.5,
    personalityTolerance: 0.5,
    cardId: null,
    isBuiltin: false,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  };
}

function makeHistory(count: number): Message[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    conversationId: 'c1',
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: [{ type: 'text', text: `历史消息编号${i}，内容长度固定。` }],
    contentParts: [],
    feedback: null,
    status: 'sent',
    createdAt: '',
    updatedAt: '',
  })) as unknown as Message[];
}

function assembled(messages: { window: number; history: Message[] }): ChatMessage[] {
  return buildTurnMessages({
    assistant: makeAssistant(),
    history: messages.history,
    rag: null,
    images: new Map(),
    contextWindow: messages.window,
    toolDefs: [],
    lastCompletionTokens: null,
    summary: null,
    memoryBlock: null,
    skillBlock: null,
    emotionBlock: null,
    card: null,
  }).messages;
}

function assembledHistoryCount(contextWindow: number, history: Message[]): number {
  return assembled({ window: contextWindow, history }).filter((m) => m.role !== 'system').length;
}

/**
 * 二分找出「50 条输入恰好被 token 预算裁到 42 条」的最大窗口：
 * 该窗口下 42 条一定放得下、43 条放不下——消息成本随角色浮动，搜索比算术反推稳。
 */
function smallWindowFor42(history50: Message[]): number {
  let lo = 2048;
  let hi = 100_000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (assembledHistoryCount(mid, history50) <= 42) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

describe('v1.8 M3 上下文条数钳制', () => {
  // 小窗口由 50 条输入二分标定：恰好只能容纳 42 条
  const winSmall = smallWindowFor42(makeHistory(60).slice(-50));

  it('纯函数：取最近 N 条；越界/非整数/空值回落默认 20', () => {
    const all = makeHistory(60);
    expect(applyContextMessageCap(all, 2)).toHaveLength(2);
    expect(applyContextMessageCap(all, 50)).toHaveLength(50);
    expect(applyContextMessageCap(all, 51)).toHaveLength(DEFAULT_CONTEXT_MESSAGES);
    expect(applyContextMessageCap(all, 1)).toHaveLength(DEFAULT_CONTEXT_MESSAGES);
    expect(applyContextMessageCap(all, 2.5)).toHaveLength(DEFAULT_CONTEXT_MESSAGES);
    expect(applyContextMessageCap(all, null)).toHaveLength(DEFAULT_CONTEXT_MESSAGES);
    expect(applyContextMessageCap(all, undefined)).toHaveLength(DEFAULT_CONTEXT_MESSAGES);
    // 不修改原数组、保留时间正序
    const capped = applyContextMessageCap(all, 5);
    expect(all).toHaveLength(60);
    expect(capped.map((m) => m.id)).toEqual(['m55', 'm56', 'm57', 'm58', 'm59']);
  });

  it('双窗口 42/42：条数 42 时大小窗口都恰好装配 42 条', () => {
    const history = applyContextMessageCap(makeHistory(60), 42);
    expect(history).toHaveLength(42);

    expect(assembledHistoryCount(winSmall, history)).toBe(42);
    expect(assembledHistoryCount(100_000, history)).toBe(42);
  });

  it('双窗口 42/50：条数 50 时大窗口 50 条，小窗口被 token 预算裁到 42', () => {
    const history = applyContextMessageCap(makeHistory(60), 50);
    expect(history).toHaveLength(50);

    expect(assembledHistoryCount(winSmall, history)).toBe(42);
    expect(assembledHistoryCount(100_000, history)).toBe(50);
  });
});
