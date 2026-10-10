import { describe, expect, it } from 'vitest';
import { overlapLength, stitchChunks, type StitchChunk } from './stitch-chunks';

function chunk(id: number, ordinal: number, content: string): StitchChunk {
  return { id, ordinal, content, pageNo: ordinal + 1, paragraphNo: ordinal + 1 };
}

describe('overlapLength', () => {
  it('取最长公共前后缀且受上界约束', () => {
    expect(overlapLength('abcdefghij', 'hijklm', 5)).toBe(3);
    // 上界 2 时只允许在 2 字符内寻找公共前后缀（'ij' 命中，'hij' 超界）
    expect(overlapLength('abcdefghij', 'ijklm', 2)).toBe(2);
    expect(overlapLength('abc', 'xyz', 5)).toBe(0);
  });

  it('上界为 0 时不重叠', () => {
    expect(overlapLength('abc', 'abc', 0)).toBe(0);
  });
});

describe('stitchChunks', () => {
  it('空分片返回空文档与空 run', () => {
    const doc = stitchChunks([]);
    expect(doc.text).toBe('');
    expect(doc.runs).toEqual([]);
  });

  it('单个分片：文本即内容，run 全覆盖', () => {
    const doc = stitchChunks([chunk(1, 0, 'hello')]);
    expect(doc.text).toBe('hello');
    expect(doc.runs).toEqual([
      { start: 0, end: 5, chunkId: 1, ordinal: 0, pageNo: 1, paragraphNo: 1 },
    ]);
  });

  it('重叠分片：去重重叠窗口后拼出原文', () => {
    // 模拟 chunking：片0 尾部 hij 作为片1 的开头 atom
    const doc = stitchChunks(
      [chunk(2, 1, 'hij\n\nklmn'), chunk(1, 0, 'abcdefghij')],
      { maxOverlap: 5 },
    );
    expect(doc.text).toBe('abcdefghij\n\nklmn');
  });

  it('无重叠分片：直接相接（硬切场景句子可跨片还原）', () => {
    const doc = stitchChunks([chunk(1, 0, 'abcde'), chunk(2, 1, 'fghij')], {
      maxOverlap: 2,
    });
    expect(doc.text).toBe('abcdefghij');
    expect(doc.runs.map((r) => r.chunkId)).toEqual([1, 2]);
    expect(doc.runs[1]!.start).toBe(5);
  });

  it('runs 有序无缺口、完整覆盖虚拟文本', () => {
    const doc = stitchChunks(
      [chunk(1, 0, 'aaaabbbb'), chunk(2, 1, 'bbbbcccc'), chunk(3, 2, 'ccccdddd')],
      { maxOverlap: 6 },
    );
    expect(doc.text).toBe('aaaabbbbccccdddd');
    expect(doc.runs[0]!.start).toBe(0);
    expect(doc.runs[doc.runs.length - 1]!.end).toBe(doc.text.length);
    for (let i = 1; i < doc.runs.length; i += 1) {
      expect(doc.runs[i]!.start).toBe(doc.runs[i - 1]!.end);
    }
  });

  it('乱序输入与有序输入结果一致（确定性）', () => {
    const parts = [chunk(1, 0, 'aaaabbbb'), chunk(2, 1, 'bbbbcccc'), chunk(3, 2, 'ccccdddd')];
    const a = stitchChunks(parts, { maxOverlap: 6 });
    const b = stitchChunks([parts[2]!, parts[0]!, parts[1]!], { maxOverlap: 6 });
    expect(b).toEqual(a);
  });

  it('下一片完全被包含时不产生新内容也不报错', () => {
    const doc = stitchChunks(
      [chunk(1, 0, 'abcdefgh'), chunk(2, 1, 'cdefgh')],
      { maxOverlap: 8 },
    );
    expect(doc.text).toBe('abcdefgh');
    expect(doc.runs).toHaveLength(1);
  });

  it('页/段坐标随 run 透传（含 null）', () => {
    const doc = stitchChunks([
      { id: 1, ordinal: 0, content: 'abcde', pageNo: null, paragraphNo: 3 },
      { id: 2, ordinal: 1, content: 'fghij', pageNo: 2, paragraphNo: null },
    ]);
    expect(doc.runs[0]!.pageNo).toBeNull();
    expect(doc.runs[0]!.paragraphNo).toBe(3);
    expect(doc.runs[1]!.pageNo).toBe(2);
    expect(doc.runs[1]!.paragraphNo).toBeNull();
  });
});
