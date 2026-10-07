import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPRESSION,
  EXPRESSION_TAGS,
  normalizeExpressionName,
  stripExpressionDirectives,
} from './expression';

describe('normalizeExpressionName', () => {
  it('规范标签原样返回（8 个 VTuber 表情）', () => {
    for (const tag of EXPRESSION_TAGS) {
      expect(normalizeExpressionName(tag)).toBe(tag);
    }
    expect(DEFAULT_EXPRESSION).toBe('neutral');
  });

  it('近义词归一（大小写/空白不敏感）', () => {
    expect(normalizeExpressionName('HAPPY')).toBe('joy');
    expect(normalizeExpressionName('shocked')).toBe('surprise');
    expect(normalizeExpressionName(' cry ')).toBe('sadness');
    expect(normalizeExpressionName('mad')).toBe('anger');
  });

  it('不认识的词返回 null', () => {
    expect(normalizeExpressionName('dance')).toBeNull();
    expect(normalizeExpressionName('x')).toBeNull();
  });
});

describe('stripExpressionDirectives', () => {
  it('移除已闭合的规范/别名标签，保留正常文本与未知括号', () => {
    expect(stripExpressionDirectives('[joy]你好呀')).toBe('你好呀');
    expect(stripExpressionDirectives('好的 [HAPPY] 马上 [note]')).toBe('好的  马上 [note]');
  });

  it('流式半标签：已知前缀先隐藏，未知名不误伤', () => {
    expect(stripExpressionDirectives('你好[jo')).toBe('你好');
    expect(stripExpressionDirectives('你好[joy]')).toBe('你好');
    expect(stripExpressionDirectives('见[备注')).toBe('见[备注');
  });

  it('无标签文本原样返回', () => {
    expect(stripExpressionDirectives('普通文本 [1]')).toBe('普通文本 [1]');
  });
});
