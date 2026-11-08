import { describe, expect, it } from 'vitest';
import type { Assistant, Message } from '@wbfm/shared/types';
import { buildChatMessages, buildSystemPrompt } from '../prompt';
import { estimateMessageTokens } from '../context-budget';
import type { ChatMessage } from '@wbfm/ai';
import type { RagContext } from '../../base/types';

function makeAssistant(partial: Partial<Assistant> = {}): Assistant {
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
    stagePlan: null,
    isBuiltin: false,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function textMsg(role: Message['role'], content: string): Message {
  return { role, content, contentParts: [] } as unknown as Message;
}

function makeRag(): RagContext {
  return { citations: [], contextBlock: '资料A', chunks: [] };
}

function totalTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}

describe('v2.26 P1 上下文注入顺序与配额', () => {
  it('顺序：人设 → 硬约束 → 结构化事实 → 摘要 → 记忆 → RAG', () => {
    const prompt = buildSystemPrompt(
      makeAssistant(),
      makeRag(),
      '早期摘要',
      '长期记忆',
      null,
      null,
      {
        constraintBlock: '【硬约束】\n- 对花生过敏',
        factsBlock: '【对话事实】\n- 预算 5000元',
      },
    );
    const indexes = [
      prompt.indexOf('简洁的助手'),
      prompt.indexOf('【硬约束】'),
      prompt.indexOf('【对话事实】'),
      prompt.indexOf('【对话摘要】'),
      prompt.indexOf('【长期记忆】'),
      prompt.indexOf('【参考资料】'),
    ];
    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it('空白区块不注入', () => {
    const prompt = buildSystemPrompt(makeAssistant(), null, null, null, null, null, {
      constraintBlock: '   ',
      factsBlock: '',
    });
    expect(prompt).not.toContain('【硬约束】');
    expect(prompt).not.toContain('【对话事实】');
  });

  it('事实块超 10% 配额时被截断，整轮请求仍落在安全窗口内', () => {
    const hugeFacts = `【对话事实】\n${'- 预算 5000 元\n'.repeat(300)}`;
    const { messages } = buildChatMessages(
      makeAssistant(),
      [textMsg('user', '你好')],
      null,
      undefined,
      {
        contextWindow: 4096,
        toolsTokens: 0,
        lastCompletionTokens: null,
        factsBlock: hugeFacts,
      },
    );
    const system = messages[0]!.content as string;
    expect(system).toContain('【对话事实】');
    expect(system.length).toBeLessThan(hugeFacts.length);
    expect(totalTokens(messages)).toBeLessThanOrEqual(Math.floor(4096 * 0.9) + 24);
  });
});
