import { describe, expect, it } from 'vitest';
import { locateContexts, locateMention, locateMentions } from './locate-mentions';
import type { CharRun } from './stitch-chunks';

const runs: CharRun[] = [
  { start: 0, end: 10, chunkId: 1, ordinal: 0, pageNo: 1, paragraphNo: 1 },
  { start: 10, end: 20, chunkId: 2, ordinal: 1, pageNo: 1, paragraphNo: 2 },
  { start: 20, end: 30, chunkId: 3, ordinal: 2, pageNo: 2, paragraphNo: 3 },
];

describe('locateMention', () => {
  it('句首所在 run 即归属片', () => {
    expect(locateMention(runs, 2, 8)).toEqual({
      chunkId: 1,
      ordinal: 0,
      pageNo: 1,
      paragraphNo: 1,
    });
  });

  it('跨片句子按相交字符数取最大者', () => {
    // (10,20) 整句在 run2；(16,25) 与 run2 交 4、与 run3 交 5 → run3
    expect(locateMention(runs, 10, 20)!.chunkId).toBe(2);
    expect(locateMention(runs, 16, 25)!.chunkId).toBe(3);
  });

  it('同相交长度时取 ordinal 较小者', () => {
    // 15-25：run1 交 5、run2 交 5
    expect(locateMention(runs, 15, 25)!.ordinal).toBe(1);
  });

  it('边界贴边（句首=run 起点/句末=run 终点）可命中', () => {
    expect(locateMention(runs, 10, 12)!.chunkId).toBe(2);
    expect(locateMention(runs, 8, 10)!.chunkId).toBe(1);
  });

  it('越界/空区间/空 run 表返回 null', () => {
    expect(locateMention(runs, 30, 40)).toBeNull();
    expect(locateMention(runs, 5, 5)).toBeNull();
    expect(locateMention([], 0, 1)).toBeNull();
  });
});

describe('locateContexts 原句定位（规则/LLM 共用）', () => {
  const text = '0123456789abcdefghij0123456789';

  it('逐字原句解析到坐标；重复句去重；非原文子串丢弃', () => {
    const result = locateContexts(text, runs, [
      'abcdefghij',
      'abcdefghij',
      '23456',
      '这不是原文里的句子',
    ]);
    expect(result.map((r) => r.context)).toEqual(['abcdefghij', '23456']);
    expect(result[0]!.location.chunkId).toBe(2);
    // '23456' 首次出现位于 2-6（run1），重复句取首次出现位置
    expect(result[1]!.location.chunkId).toBe(1);
  });

  it('trim 后仍可定位', () => {
    const result = locateContexts(text, runs, ['  abcdef ']);
    expect(result[0]!.context).toBe('abcdef');
  });
});

describe('locateMentions 批量', () => {
  it('过滤无法定位的条目，保留顺序', () => {
    const result = locateMentions(runs, [
      { charStart: 0, charEnd: 4 },
      { charStart: 40, charEnd: 50 },
      { charStart: 22, charEnd: 28 },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]!.location.chunkId).toBe(1);
    expect(result[1]!.location.chunkId).toBe(3);
    expect(result[1]!.spec).toEqual({ charStart: 22, charEnd: 28 });
  });
});
