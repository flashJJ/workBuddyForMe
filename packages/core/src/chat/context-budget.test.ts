import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@wbfm/ai';
import {
  IMAGE_TOKEN_ESTIMATE,
  estimateMessageTokens,
  estimateTokens,
  truncateToTokens,
  assembleHistoryWithinBudget,
} from './context-budget';

/** 'abcdefghij' 10 个非 CJK 字符 → ceil(10/4)=3 token，加每条消息固定开销 4 = 7 */
function asciiMsg(content: string, role: ChatMessage['role'] = 'user'): ChatMessage {
  return { role, content };
}
const ASCII_10 = 'abcdefghij';
const MSG_COST = 7;

describe('estimateTokens（字符粗估：CJK≈1.5 字符/token，其余≈4 字符/token）', () => {
  it('纯中文按 1.5 字符/token', () => {
    expect(estimateTokens('一二三四五六')).toBe(4);
  });

  it('纯 ASCII 按 4 字符/token', () => {
    expect(estimateTokens('abcdefgh')).toBe(2);
  });

  it('中英混合分别计价后取整', () => {
    // 3 个中文（2 token）+ 3 个 ASCII（0.75）→ ceil(2.75)=3
    expect(estimateTokens('abc一二三')).toBe(3);
  });

  it('空文本为 0', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('truncateToTokens（按预算截断文本）', () => {
  it('已在预算内原样返回', () => {
    expect(truncateToTokens('一二三四', 10)).toBe('一二三四');
  });

  it('非正预算返回空串', () => {
    expect(truncateToTokens('一二三四', 0)).toBe('');
  });

  it('超长时截断并追加省略号，结果估算不超过预算', () => {
    const text = '中文内容'.repeat(100);
    const out = truncateToTokens(text, 20);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThan(text.length);
    expect(estimateTokens(out)).toBeLessThanOrEqual(20);
  });
});

describe('estimateMessageTokens', () => {
  it('文本消息 = 字符估算 + 固定结构开销', () => {
    expect(estimateMessageTokens(asciiMsg(ASCII_10))).toBe(MSG_COST);
  });

  it('图片片段按固定值估算', () => {
    const message: ChatMessage = {
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } }],
    };
    expect(estimateMessageTokens(message)).toBe(4 + IMAGE_TOKEN_ESTIMATE);
  });

  it('工具调用按 JSON 体积追加', () => {
    const base = estimateMessageTokens({ role: 'assistant', content: null });
    const withCall = estimateMessageTokens({
      role: 'assistant',
      content: null,
      toolCalls: [
        { id: 'c1', type: 'function', function: { name: 'current_time', arguments: '{}' } },
      ],
    });
    expect(withCall).toBeGreaterThan(base);
  });
});

describe('assembleHistoryWithinBudget（历史按 token 预算从新到旧装配）', () => {
  it('预算充足时全部保留，truncated=false', () => {
    const history = [asciiMsg('a1'), asciiMsg('a2'), asciiMsg('a3')];
    const { kept, stats } = assembleHistoryWithinBudget({
      history,
      contextWindow: 3000,
      systemTokens: 0,
      toolsTokens: 0,
      lastCompletionTokens: null,
    });
    expect(kept).toEqual(history);
    expect(stats.truncated).toBe(false);
    expect(stats.keptMessages).toBe(3);
    expect(stats.droppedMessages).toBe(0);
  });

  it('超预算时丢弃最旧消息，保留最近连续后缀', () => {
    // 3 条 × 6 token（5 字符 + 开销 4），预算 15：最后 2 条装入（12 ≤ 15），最旧 1 条被裁
    const history = [asciiMsg('old-1'), asciiMsg('mid-2'), asciiMsg('new-3')];
    const { kept, stats } = assembleHistoryWithinBudget({
      history,
      contextWindow: 15 + 2048,
      systemTokens: 0,
      toolsTokens: 0,
      lastCompletionTokens: null,
    });
    expect(kept.map((m) => m.content)).toEqual(['mid-2', 'new-3']);
    expect(stats.historyBudget).toBe(15);
    expect(stats.keptMessages).toBe(2);
    expect(stats.droppedMessages).toBe(1);
    expect(stats.estimatedHistoryTokens).toBe(12);
    expect(stats.truncated).toBe(true);
  });

  it('本轮用户消息恒保留：即使单独超预算也不丢失', () => {
    const oversized = 'x'.repeat(2000); // ≈500 token
    const { kept, stats } = assembleHistoryWithinBudget({
      history: [asciiMsg(oversized)],
      contextWindow: 15 + 2048,
      systemTokens: 0,
      toolsTokens: 0,
      lastCompletionTokens: null,
    });
    expect(kept).toHaveLength(1);
    expect(stats.truncated).toBe(false);
    expect(stats.estimatedHistoryTokens).toBeGreaterThan(stats.historyBudget);
  });

  it('system + 工具声明计入扣除，压缩历史预算', () => {
    const history = [asciiMsg(ASCII_10)];
    const { kept, stats } = assembleHistoryWithinBudget({
      history,
      contextWindow: 2048 + 100,
      systemTokens: 60,
      toolsTokens: 30,
      lastCompletionTokens: null,
    });
    // 预算 = 2148 − 60 − 30 − 2048 = 10 < 7？否：10 ≥ 7，仍可装入 1 条
    expect(stats.historyBudget).toBe(10);
    expect(kept).toHaveLength(1);
  });

  it('system+tools 过大时历史预算归零，仅保留本轮用户消息', () => {
    const history = [asciiMsg('old'), asciiMsg('new')];
    const { kept, stats } = assembleHistoryWithinBudget({
      history,
      contextWindow: 2048 + 50,
      systemTokens: 40,
      toolsTokens: 20,
      lastCompletionTokens: null,
    });
    expect(stats.historyBudget).toBe(0);
    expect(kept.map((m) => m.content)).toEqual(['new']);
    expect(stats.truncated).toBe(true);
  });

  it('上次真实 completion 校准输出预留：max(默认, 真实+128)', () => {
    const { stats } = assembleHistoryWithinBudget({
      history: [asciiMsg(ASCII_10)],
      contextWindow: 5200,
      systemTokens: 0,
      toolsTokens: 0,
      lastCompletionTokens: 3000,
    });
    expect(stats.reserveTokens).toBe(3128);
    expect(stats.historyBudget).toBe(5200 - 3128);
  });

  it('上次 completion 低于默认预留时仍用默认值', () => {
    const { stats } = assembleHistoryWithinBudget({
      history: [asciiMsg(ASCII_10)],
      contextWindow: 5200,
      systemTokens: 0,
      toolsTokens: 0,
      lastCompletionTokens: 100,
    });
    expect(stats.reserveTokens).toBe(2048);
  });
});
