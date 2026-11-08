import { describe, expect, it, vi } from 'vitest';
import type { ChatChunk, ChatParams } from '@wbfm/ai';
import type { Message } from '@wbfm/shared/types';
import type { MessageRole } from '@wbfm/shared/constants';
import type { ResolvedChatTarget } from '../model-resolver';
import { summarizeConversationStructured } from '../summarizer';

function domainMessage(role: MessageRole, content: string): Message {
  return {
    id: `${role}-${content}`,
    conversationId: 'c1',
    role,
    content,
    status: 'completed',
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    citations: [],
    toolTrace: [],
    contentParts: [],
    feedback: null,
    feedbackAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
  };
}

async function* fakeStream(chunks: string[]): AsyncGenerator<ChatChunk> {
  for (const delta of chunks) yield { delta };
}

/** 按调用顺序返回不同响应；用于模拟首版摘要与保真重试 */
function targetWith(responses: string[]) {
  const calls: ChatParams[] = [];
  const provider = {
    chatStream: vi.fn((params: ChatParams) => {
      calls.push(params);
      return fakeStream([responses[Math.min(calls.length - 1, responses.length - 1)] ?? '']);
    }),
  };
  const target = { provider, model: { modelId: 'summary-model' } } as unknown as ResolvedChatTarget;
  return { target, calls };
}

const folded = [domainMessage('user', '预算 5000 元'), domainMessage('assistant', '收到')];

describe('v2.26 P1 结构化摘要', () => {
  it('合法 JSON → 返回结构化载荷且不重试', async () => {
    const { target, calls } = targetWith([
      JSON.stringify({
        summary: '预算 5000 元',
        facts: [{ key: 'budget', value: '5000', unit: '元', validFrom: null }],
        decisions: ['预算通过'],
        open_loops: ['确认交付时间'],
      }),
    ]);
    const result = await summarizeConversationStructured({
      target,
      previousSummary: null,
      folded,
    });
    expect(calls).toHaveLength(1);
    expect(result.retried).toBe(false);
    expect(result.fidelityMissing).toEqual([]);
    expect(result.payload.facts).toHaveLength(1);
    expect(result.payload.decisions).toEqual(['预算通过']);
    expect(result.payload.openLoops).toEqual(['确认交付时间']);
  });

  it('首版丢失数字 → 带缺失清单重试一次并采用更完整结果', async () => {
    const { target, calls } = targetWith([
      JSON.stringify({ summary: '讨论了预算', facts: [], decisions: [], open_loops: [] }),
      JSON.stringify({ summary: '预算 5000 元', facts: [], decisions: [], open_loops: [] }),
    ]);
    const result = await summarizeConversationStructured({
      target,
      previousSummary: null,
      folded,
    });
    expect(calls).toHaveLength(2);
    expect(result.retried).toBe(true);
    expect(result.payload.summary).toBe('预算 5000 元');
    expect(result.fidelityMissing).toEqual([]);
    expect(String(calls[1]!.messages.at(-1)!.content)).toContain('5000元');
  });

  it('重试仍丢失 → 用原文片段兜底，并记录缺失 token', async () => {
    const { target } = targetWith([
      JSON.stringify({ summary: '讨论了预算', facts: [], decisions: [], open_loops: [] }),
    ]);
    const result = await summarizeConversationStructured({
      target,
      previousSummary: null,
      folded,
    });
    expect(result.payload.summary).toContain('【原文片段】');
    expect(result.payload.summary).toContain('5000 元');
    expect(result.fidelityMissing).toContain('5000元');
  });

  it('纯文本回复 → 回退为正文摘要，不抛错', async () => {
    const { target } = targetWith(['```text\n早期摘要内容\n```']);
    const result = await summarizeConversationStructured({
      target,
      previousSummary: null,
      folded: [domainMessage('user', '你好')],
    });
    expect(result.payload.summary).toBe('早期摘要内容');
    expect(result.payload.facts).toEqual([]);
  });
});
