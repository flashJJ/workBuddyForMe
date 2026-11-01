// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  latestExpression,
  parseExpressionTags,
  stripExpressionDirectives,
} from './expression-parser';

describe('parseExpressionTags', () => {
  it('按顺序提取标签并给出下标与原文', () => {
    const hits = parseExpressionTags('好的[joy]马上来 [surprise]真的吗');
    expect(hits.map((h) => h.tag)).toEqual(['joy', 'surprise']);
    expect(hits[0]!.raw).toBe('joy');
    expect('好的[joy]'.slice(0, hits[0]!.index)).toBe('好的');
  });

  it('只提取可识别标签，未知方括号内容忽略', () => {
    expect(parseExpressionTags('[note] 记住 [joy]')).toEqual([
      expect.objectContaining({ tag: 'joy' }),
    ]);
  });

  it('无标签返回空数组', () => {
    expect(parseExpressionTags('普通文本 123')).toEqual([]);
  });
});

describe('latestExpression', () => {
  it('返回最后一个标签', () => {
    expect(latestExpression('[joy]哈哈[sadness]呜')).toBe('sadness');
  });
  it('无标签为 null；别名也认', () => {
    expect(latestExpression('没有标签')).toBeNull();
    expect(latestExpression('[happy]')).toBe('joy');
  });
});

describe('stripExpressionDirectives（shared 同源 re-export 冒烟）', () => {
  it('上屏文本剥离表情标签含流末尾半标签', () => {
    expect(stripExpressionDirectives('[joy]你好[jo')).toBe('你好');
  });
});
