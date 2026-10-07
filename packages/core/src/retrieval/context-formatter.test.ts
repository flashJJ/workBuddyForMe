import { describe, expect, it } from 'vitest';
import { fitContextBlock } from './context-formatter';
import { estimateTokens } from '../chat/context-budget';
import type { RagChunk } from '../chat/types';

function chunk(i: number, content: string, name = 'doc.txt'): RagChunk {
  return { documentName: name, ordinal: i, content };
}

const BODY = '这是一段用于测试的中文资料片段，大约占用三十个估算令牌左右的空间长度。';

describe('fitContextBlock（RAG 按 token 预算贪心装配）', () => {
  it('预算充足：全部片段完整装入，编号连续，limited=false', () => {
    const chunks = [chunk(0, BODY), chunk(1, BODY), chunk(2, BODY)];
    const r = fitContextBlock(chunks, 100_000);
    expect(r.included).toBe(3);
    expect(r.limited).toBe(false);
    expect(r.block).toContain('[1]');
    expect(r.block).toContain('[2]');
    expect(r.block).toContain('[3]');
    expect(r.block).toContain('片段 1');
    expect(r.block).toContain('片段 3');
  });

  it('预算只够前两条：保留前缀且编号从 1 连续，limited=true', () => {
    const body = BODY.repeat(4);
    const chunks = [chunk(0, body), chunk(1, body), chunk(2, body), chunk(3, body)];
    // 用实测条目成本构造「恰好装两条」的预算（第三条 + 分隔符必然超，且高于注入下限）
    const entryCost = estimateTokens(`[1] 来源：《doc.txt》片段 1\n${body}`);
    expect(entryCost).toBeGreaterThan(96);
    const r = fitContextBlock(chunks, entryCost * 2 + estimateTokens('\n\n'));
    expect(r.included).toBe(2);
    expect(r.limited).toBe(true);
    expect(r.block).toContain('[1]');
    expect(r.block).toContain('[2]');
    expect(r.block).not.toContain('[3]');
  });

  it('首条整条超预算：截断正文保留下限，带省略号，编号仍为 [1]', () => {
    const longBody = '超长中文内容'.repeat(100);
    const r = fitContextBlock([chunk(0, longBody)], 200);
    expect(r.included).toBe(1);
    expect(r.limited).toBe(true);
    expect(r.block).toContain('[1] 来源：《doc.txt》');
    expect(r.block.endsWith('…')).toBe(true);
    expect(r.block).not.toContain(longBody);
  });

  it('预算低于注入下限：整块省略', () => {
    const r = fitContextBlock([chunk(0, BODY)], 10);
    expect(r.block).toBe('');
    expect(r.included).toBe(0);
    expect(r.limited).toBe(true);
  });

  it('空片段数组：空块且不标记 limited', () => {
    const r = fitContextBlock([], 500);
    expect(r).toEqual({ block: '', included: 0, limited: false });
  });
});
