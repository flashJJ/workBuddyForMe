import { describe, expect, it } from 'vitest';
import type { Assistant, Message } from '@wbfm/shared';
import { buildChatMessages, buildSystemPrompt, EXPRESSION_DIRECTIVE_BLOCK } from './prompt';
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
    knowledgeBaseId: null,
    enabledTools: [],
    retrieveAlways: true,
    memoryEnabled: true,
    expressionEnabled: true,
    isBuiltin: false,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('buildSystemPrompt 表情指令（M3）', () => {
  it('expressionEnabled=true：人设后注入表情指令片段，含全部 8 个标签', () => {
    const prompt = buildSystemPrompt(makeAssistant(), null);
    expect(prompt.startsWith('你是一个简洁的助手。')).toBe(true);
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

  it('注入顺序：人设 → 表情指令 → RAG 资料', () => {
    const prompt = buildSystemPrompt(makeAssistant(), {
      citations: [],
      contextBlock: '资料A',
      chunks: [],
    });
    const idxPersona = prompt.indexOf('简洁的助手');
    const idxExpr = prompt.indexOf('表情指令');
    const idxRag = prompt.indexOf('资料A');
    expect(idxPersona).toBeLessThan(idxExpr);
    expect(idxExpr).toBeLessThan(idxRag);
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
