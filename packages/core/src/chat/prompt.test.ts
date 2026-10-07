import { describe, expect, it } from 'vitest';
import type { Assistant } from '@wbfm/shared';
import { buildSystemPrompt, EXPRESSION_DIRECTIVE_BLOCK } from './prompt';

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
    });
    const idxPersona = prompt.indexOf('简洁的助手');
    const idxExpr = prompt.indexOf('表情指令');
    const idxRag = prompt.indexOf('资料A');
    expect(idxPersona).toBeLessThan(idxExpr);
    expect(idxExpr).toBeLessThan(idxRag);
  });
});
