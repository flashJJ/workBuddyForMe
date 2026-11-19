import { describe, expect, it } from 'vitest';
import { chunkText } from './chunking';

describe('段落友好分片（TR-16.1）', () => {
  it('空文本返回空数组', () => {
    expect(chunkText('   \n  ', { chunkSize: 100, chunkOverlap: 20 })).toEqual([]);
  });

  it('短文本单分片，CRLF 归一化并记录字符区间', () => {
    const chunks = chunkText('第一段内容', { chunkSize: 100, chunkOverlap: 20 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe('第一段内容');
    expect(chunks[0]!.charStart).toBe(0);
    expect(chunks[0]!.charEnd).toBe(5);
  });

  it('多段超长文本拆为多个分片，单片不超过 chunkSize', () => {
    const paragraphs = Array.from({ length: 6 }, (_, i) => `这是第${i + 1}段。`.repeat(20));
    const text = paragraphs.join('\n\n');
    const chunks = chunkText(text, { chunkSize: 80, chunkOverlap: 20 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(80);
      expect(chunk.charEnd).toBeGreaterThanOrEqual(chunk.charStart);
    }
  });

  it('相邻分片携带 overlap 尾片，且原文关键词都被覆盖', () => {
    const text = `${'苹果'.repeat(40)}\n\n${'香蕉'.repeat(40)}`;
    const chunks = chunkText(text, { chunkSize: 50, chunkOverlap: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1]!.content.startsWith('苹果')).toBe(true);
    const joined = chunks.map((c) => c.content).join('');
    expect(joined).toContain('苹果');
    expect(joined).toContain('香蕉');
  });

  it('无标点超长段落按字符硬切', () => {
    const chunks = chunkText('a'.repeat(200), { chunkSize: 50, chunkOverlap: 10 });
    expect(chunks).toHaveLength(5);
    expect(chunks.every((c) => c.content === 'a'.repeat(c.content.length))).toBe(true);
  });
});
