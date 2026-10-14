import { describe, expect, it } from 'vitest';
import type { Assistant, Message } from '@wbfm/shared/types';
import type { ParsedCharacterCard } from '@wbfm/shared/character-card';
import { buildChatMessages, buildSystemPrompt, EXPRESSION_DIRECTIVE_BLOCK } from './prompt';
import { buildPersonaBlock } from './persona-prompt';
import { estimateMessageTokens } from './context-budget';
import type { ChatMessage } from '@wbfm/ai';
import type { RagChunk, RagContext } from './types';

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
    retrieveAlways: true,
    memoryEnabled: true,
    expressionEnabled: true,
    personalityFrankness: 0.5,
    personalityTsundere: 0.5,
    personalityShy: 0.5,
    personalityTolerance: 0.5,
    cardId: null,
    isBuiltin: false,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function makeCard(partial: Partial<ParsedCharacterCard> = {}): ParsedCharacterCard {
  return {
    name: '干练同事',
    description: '测试副文案',
    defaultEmotion: 'neutral',
    voice: null,
    identity: '你是用户的资深同事，先给结论再给依据。',
    traits: ['先结论后依据', '不堆套话'],
    speakingStyle: ['短句分点'],
    boundaries: ['不替用户做不可逆决定'],
    ...partial,
  };
}

describe('buildSystemPrompt 表情指令（M3）', () => {
  it('expressionEnabled=true：系统层注入表情指令片段，含全部 8 个标签', () => {
    const prompt = buildSystemPrompt(makeAssistant(), null);
    expect(prompt).toContain('你是一个简洁的助手。');
    expect(prompt).toContain(EXPRESSION_DIRECTIVE_BLOCK);
    for (const tag of [
      '[neutral]',
      '[joy]',
      '[anger]',
      '[sadness]',
      '[surprise]',
      '[fear]',
      '[disgust]',
      '[smirk]',
    ]) {
      expect(prompt).toContain(tag);
    }
  });

  it('expressionEnabled=false：不注入表情片段', () => {
    const prompt = buildSystemPrompt(makeAssistant({ expressionEnabled: false }), null);
    expect(prompt).toBe('你是一个简洁的助手。');
    expect(prompt).not.toContain('表情指令');
  });

  it('注入顺序：表情指令（系统层）→ 人设 → RAG 资料', () => {
    const prompt = buildSystemPrompt(makeAssistant(), {
      citations: [],
      contextBlock: '资料A',
      chunks: [],
    });
    const idxPersona = prompt.indexOf('简洁的助手');
    const idxExpr = prompt.indexOf('表情指令');
    const idxRag = prompt.indexOf('资料A');
    expect(idxExpr).toBeLessThan(idxPersona);
    expect(idxPersona).toBeLessThan(idxRag);
  });
});

describe('v1.8 身份卡 / 全局追加段落契约', () => {
  it('buildPersonaBlock：固定小节序 identity→性格→风格→边界，缺章节省略', () => {
    const block = buildPersonaBlock(makeCard())!;
    expect(block).toBe(`【角色卡】
你是用户的资深同事，先给结论再给依据。

性格特征：
- 先结论后依据
- 不堆套话

说话风格：
- 短句分点

边界：
- 不替用户做不可逆决定`);
    const sparse = buildPersonaBlock(makeCard({ traits: [], speakingStyle: [], boundaries: [] }))!;
    expect(sparse).toBe('【角色卡】\n你是用户的资深同事，先给结论再给依据。');
    expect(buildPersonaBlock(makeCard({ identity: '', traits: [], speakingStyle: [], boundaries: [] })))
      .toBeNull();
  });

  it('选卡后：身份卡替代 systemPrompt 入模，原文提示词不再出现', () => {
    const prompt = buildSystemPrompt(makeAssistant(), null, null, null, null, null, {
      card: makeCard(),
    });
    expect(prompt).toContain('【角色卡】');
    expect(prompt).toContain('先结论后依据');
    expect(prompt).not.toContain('你是一个简洁的助手。');
  });

  it('固定段落顺序：系统层 → 身份卡 → 全局追加 → 情绪 → 摘要 → 记忆 → 技能 → RAG', () => {
    const prompt = buildSystemPrompt(
      makeAssistant(),
      { citations: [], contextBlock: '资料A', chunks: [] },
      '早期摘要',
      '用户偏好记忆',
      '技能流程块',
      '【当前心情】平静',
      { card: makeCard(), globalAppendPrompt: '全局追加：回答末尾标注置信度。' },
    );
    const positions = [
      prompt.indexOf('表情指令'),
      prompt.indexOf('【角色卡】'),
      prompt.indexOf('全局追加'),
      prompt.indexOf('【当前心情】'),
      prompt.indexOf('【对话摘要】'),
      prompt.indexOf('【长期记忆】'),
      prompt.indexOf('技能流程块'),
      prompt.indexOf('资料A'),
    ];
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(prompt).toMatchSnapshot();
  });

  it('空壳卡（四节全空）回落 systemPrompt；全局追加空白串忽略', () => {
    const prompt = buildSystemPrompt(makeAssistant(), null, null, null, null, null, {
      card: makeCard({ identity: '', traits: [], speakingStyle: [], boundaries: [] }),
      globalAppendPrompt: '   ',
    });
    expect(prompt).toContain('你是一个简洁的助手。');
    expect(prompt).not.toContain('【角色卡】');
  });

  it('预算装配路径同样携带身份卡段', () => {
    const { messages } = buildChatMessages(
      makeAssistant({ expressionEnabled: false }),
      [textMsg('user', '你好')],
      null,
      undefined,
      { contextWindow: 4096, toolsTokens: 0, lastCompletionTokens: null, card: makeCard() },
    );
    const system = messages[0]!.content as string;
    expect(system).toContain('【角色卡】');
    expect(system).toContain('先结论后依据');
  });
});

function textMsg(role: Message['role'], content: string): Message {
  return { role, content, contentParts: [] } as unknown as Message;
}

function makeRag(chunks: { content: string; ordinal?: number }[]): RagContext {
  const list: RagChunk[] = chunks.map((c, i) => ({
    documentName: '知识库文档.pdf',
    ordinal: c.ordinal ?? i,
    content: c.content,
  }));
  return { citations: [], contextBlock: list.map((c) => c.content).join('\n\n'), chunks: list };
}

/** 估算装配出的整轮请求 token（system + 全部消息） */
function totalEstimatedTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}

describe('buildChatMessages RAG 预算硬限长（Ollama 4096 窗口场景）', () => {
  const question = '我想学 AI，但是完全没有代码基础，学什么好？';
  // 4 段纯中文长片段（每段 900 字 ≈ 600 估算 token），总量远超 4096
  const longChunks = Array.from({ length: 4 }, () => ({
    content: '资'.repeat(900),
  }));
  const baseAssistant = makeAssistant({ expressionEnabled: false });

  it('4096 窗口 + 4 段长资料：只装前两段，整轮估算不超过 4096（安全系数后 ≤3686）', () => {
    const { messages } = buildChatMessages(
      baseAssistant,
      [textMsg('user', question)],
      makeRag(longChunks),
      undefined,
      { contextWindow: 4096, toolsTokens: 0, lastCompletionTokens: null },
    );
    const system = messages[0]!;
    expect(typeof system.content).toBe('string');
    const sys = system.content as string;
    expect(sys).toContain('【参考资料】');
    expect(sys).toContain('[1]');
    expect(sys).toContain('[2]');
    expect(sys).not.toContain('[3]');
    expect(sys).not.toContain('[4]');
    // 当前问题不被资料挤掉
    expect(messages.some((m) => m.content === question)).toBe(true);
    // 硬保证：整轮请求落在安全窗口内（给结构估算 24 token 容差）
    expect(totalEstimatedTokens(messages)).toBeLessThanOrEqual(Math.floor(4096 * 0.9) + 24);
  });

  it('窗口极小放不下任何片段：省略整个资料块（降级无资料问答），当前问题仍保留', () => {
    const { messages } = buildChatMessages(
      baseAssistant,
      [textMsg('user', question)],
      makeRag(longChunks),
      undefined,
      { contextWindow: 1024, toolsTokens: 0, lastCompletionTokens: null },
    );
    const sys = messages[0]!.content as string;
    expect(sys).not.toContain('【参考资料】');
    expect(messages.some((m) => m.content === question)).toBe(true);
  });

  it('大窗口：全部 4 段资料完整注入', () => {
    const { messages } = buildChatMessages(
      baseAssistant,
      [textMsg('user', question)],
      makeRag(longChunks),
      undefined,
      { contextWindow: 32768, toolsTokens: 0, lastCompletionTokens: null },
    );
    const sys = messages[0]!.content as string;
    expect(sys).toContain('[1]');
    expect(sys).toContain('[4]');
    expect(totalEstimatedTokens(messages)).toBeLessThanOrEqual(Math.floor(32768 * 0.9) + 24);
  });
});
