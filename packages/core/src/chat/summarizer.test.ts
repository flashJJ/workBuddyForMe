import { describe, expect, it, vi } from 'vitest';
import type { ChatChunk, ChatMessage, ChatParams } from '@wbfm/ai';
import type { Message, MessageRole } from '@wbfm/shared';
import type { ResolvedChatTarget } from './model-resolver';
import {
  buildSummaryMessages,
  normalizeSummary,
  planCompaction,
  summarizeConversation,
} from './summarizer';

/** 4 个 ASCII 字符 → 1 token，加每条消息固定开销 4 = 5 token */
const MSG_COST = 5;
function msg(content: string, role: ChatMessage['role'] = 'user'): ChatMessage {
  return { role, content };
}

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

function targetWith(chunks: string[]) {
  const calls: ChatParams[] = [];
  const provider = {
    chatStream: vi.fn((params: ChatParams) => {
      calls.push(params);
      return fakeStream(chunks);
    }),
  };
  const target = {
    provider,
    model: { modelId: 'summary-model' },
  } as unknown as ResolvedChatTarget;
  return { target, calls };
}

describe('planCompaction（压缩决策）', () => {
  it('历史预算 <= 0 时不压缩', () => {
    expect(
      planCompaction({
        history: [msg('a'), msg('b'), msg('c'), msg('d'), msg('e')],
        contextWindow: 1000,
        personaTokens: 100,
        toolsTokens: 100,
        reserveTokens: 400,
      }),
    ).toBeNull();
  });

  it('消息数不超过最小保留条数时不压缩', () => {
    expect(
      planCompaction({
        history: [msg('a'), msg('b'), msg('c'), msg('d')],
        contextWindow: 10000,
        personaTokens: 0,
        toolsTokens: 0,
        reserveTokens: 0,
      }),
    ).toBeNull();
  });

  it('占用未达触发比例（0.7）时不压缩', () => {
    const history = Array.from({ length: 8 }, (_, i) => msg(`m${i}-xx`));
    // 每条约 6 token，总计 48；预算 100 → 阈值 70，不触发
    expect(
      planCompaction({ history, contextWindow: 1000 + 512, personaTokens: 0, toolsTokens: 0, reserveTokens: 0 }),
    ).toBeNull();
  });

  it('超阈值时折叠最旧消息，保留至少 4 条最近消息', () => {
    // 8 条 × 5 token = 40；预算 30 → 触发阈值 21；保留目标 15（3 条），硬底 4 条 → 折叠 4 条
    const history = Array.from({ length: 8 }, () => msg('abcd'));
    const plan = planCompaction({
      history,
      contextWindow: 30 + 2048 + 512,
      personaTokens: 0,
      toolsTokens: 0,
      reserveTokens: 2048,
    });
    expect(plan).not.toBeNull();
    expect(plan!.foldCount).toBe(4);
    expect(plan!.historyBudget).toBe(30);
    expect(plan!.totalTokens).toBe(8 * MSG_COST);
  });

  it('最近消息极长时仍受最小保留保护（可能超出保留比例）', () => {
    const history = [
      msg('old-1'),
      msg('old-2'),
      msg('old-3'),
      msg('old-4'),
      msg('x'.repeat(200)),
    ];
    const plan = planCompaction({
      history,
      contextWindow: 80 + 2048 + 512,
      personaTokens: 0,
      toolsTokens: 0,
      reserveTokens: 2048,
    });
    // 总长触发压缩，但保留后缀必须 >= 4 条，所以只能折叠第 1 条
    expect(plan?.foldCount).toBe(1);
  });
});

describe('buildSummaryMessages', () => {
  it('无旧摘要：system 指令 + 仅含待折叠转写', () => {
    const messages = buildSummaryMessages(null, [
      domainMessage('user', '我叫小明'),
      domainMessage('assistant', '你好小明'),
    ]);
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.role).toBe('user');
    const userText = messages[1]!.content as string;
    expect(userText).toContain('用户：我叫小明');
    expect(userText).toContain('助手：你好小明');
    expect(userText).not.toContain('【已有摘要】');
  });

  it('有旧摘要：带上已有摘要块做增量合并', () => {
    const messages = buildSummaryMessages('用户偏好中文回复', [domainMessage('user', '继续')]);
    const userText = messages[1]!.content as string;
    expect(userText).toContain('【已有摘要】\n用户偏好中文回复');
    expect(userText).toContain('用户：继续');
  });

  it('空文本消息显示为图片/附件占位', () => {
    const messages = buildSummaryMessages(null, [domainMessage('user', '   ')]);
    expect(messages[1]!.content).toContain('用户：（图片/附件消息）');
  });
});

describe('normalizeSummary', () => {
  it('去除 markdown 围栏与空白', () => {
    expect(normalizeSummary('```markdown\n要点一\n要点二\n```')).toBe('要点一\n要点二');
  });

  it('无围栏时仅 trim', () => {
    expect(normalizeSummary('  摘要正文  ')).toBe('摘要正文');
  });
});

describe('summarizeConversation', () => {
  it('累积流式结果，temperature 固定 0，并传入当前模型', async () => {
    const { target, calls } = targetWith(['```markdown\n', '合并摘要', '```']);
    const result = await summarizeConversation({
      target,
      previousSummary: '旧摘要',
      folded: [domainMessage('user', '你好')],
    });
    expect(result).toBe('合并摘要');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.temperature).toBe(0);
    expect(calls[0]!.model).toBe('summary-model');
    const userText = calls[0]!.messages[1]!.content as string;
    expect(userText).toContain('旧摘要');
  });

  it('摘要为空时抛错（由编排器吞掉降级）', async () => {
    const { target } = targetWith(['  ']);
    await expect(
      summarizeConversation({ target, previousSummary: null, folded: [domainMessage('user', 'x')] }),
    ).rejects.toThrow('摘要结果为空');
  });
});
