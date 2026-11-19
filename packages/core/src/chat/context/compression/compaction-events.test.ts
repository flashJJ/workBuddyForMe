import { describe, expect, it, vi } from 'vitest';
import type { Assistant, Conversation, Message } from '@wbfm/shared/types';
import { runPostTurnCompaction } from '../turn-context';

function history(count: number): Message[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `m${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: '这是一段足够长的历史内容，用来触发压缩阈值。'.repeat(6),
    contentParts: [],
  } as unknown as Message));
}

function params(over: Record<string, unknown> = {}) {
  const recordChat = vi.fn();
  return {
    recordChat,
    params: {
      conversations: {
        recentMessagesAfter: () => history(120),
        updateSummary: vi.fn(),
        saveSummaryFacts: vi.fn(),
      },
      attachments: { loadImages: () => [] },
      conversation: { id: 'c1', summary: null, summaryTurns: 0 } as unknown as Conversation,
      assistant: { systemPrompt: '人设', memoryEnabled: false } as unknown as Assistant,
      target: {
        model: { contextWindow: 20_000, modelId: 'm', capabilities: [] },
        provider: {
          chatStream: async function* () {
            yield* [];
            throw new Error('summary offline');
          },
        },
      },
      toolDefs: [],
      lastCompletionTokens: null,
      traceParent: null,
      events: { recordChat },
      trigger: 'threshold' as const,
      ...over,
    },
  };
}

describe('runPostTurnCompaction（v4.8 压缩事件化）', () => {
  it('摘要失败时记录 degraded 事件且不抛出', async () => {
    const { params: base, recordChat } = params();
    await expect(runPostTurnCompaction(base as never)).resolves.toBeNull();
    expect(recordChat).toHaveBeenCalledWith(
      'c1',
      'context_condensed',
      expect.objectContaining({ trigger: 'threshold', degraded: true }),
    );
  });

  it('摘要成功时记录折叠消息 id 与前后 token', async () => {
    const { params: base, recordChat } = params({
      target: {
        model: { contextWindow: 20_000, modelId: 'm', capabilities: [] },
        provider: {
          chatStream: async function* () {
            yield {
              delta: JSON.stringify({
                summary: '早期对话摘要',
                facts: [{ key: 'city', value: '杭州' }],
                decisions: [],
                open_loops: [],
              }),
            };
          },
        },
      },
    });
    const result = await runPostTurnCompaction(base as never);
    expect(result?.compactedTurns).toBeGreaterThan(0);
    expect(recordChat).toHaveBeenCalledWith(
      'c1',
      'context_condensed',
      expect.objectContaining({
        trigger: 'threshold',
        degraded: false,
        foldedMessageIds: expect.arrayContaining([expect.stringMatching(/^m\d+$/)]),
      }),
    );
  });
});
