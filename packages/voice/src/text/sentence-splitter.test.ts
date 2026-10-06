import { describe, expect, it } from 'vitest';
import {
  StreamingSentenceSplitter,
  splitSentences,
  stripForTts,
} from './sentence-splitter';

describe('splitSentences 一次性切分', () => {
  it('按中文句末标点切分并保留标点', () => {
    expect(splitSentences('你好。再见！真的吗？')).toEqual(['你好。', '再见！', '真的吗？']);
  });

  it('英文标点与分号也成句', () => {
    expect(splitSentences('Hi there! How are you? fine; ok')).toEqual([
      'Hi there!',
      'How are you?',
      'fine;',
      'ok',
    ]);
  });

  it('首句遇逗号提前切，后续逗号不再提前', () => {
    const parts = splitSentences('你好呀，今天天气不错，出去玩吧。');
    expect(parts).toEqual(['你好呀，', '今天天气不错，出去玩吧。']);
  });

  it('短前缀不因逗号提前（避免“嗯，”触发合成）', () => {
    const parts = splitSentences('嗯，我想想看，该怎么做呢。');
    // “嗯，”可见字数不足阈值，不切；“我想想看，”达到阈值提前切
    expect(parts).toEqual(['嗯，我想想看，', '该怎么做呢。']);
  });
});

describe('StreamingSentenceSplitter 流式行为', () => {
  it('delta 跨多次推送也能正确成句', () => {
    const s = new StreamingSentenceSplitter();
    expect(s.push('你好')).toEqual([]);
    expect(s.push('呀，今天')).toEqual(['你好呀，']);
    expect(s.push('天气不错。再')).toEqual(['今天天气不错。']);
    expect(s.flush()).toEqual(['再']);
  });

  it('首句结束后第二句重新允许首逗号快出', () => {
    const s = new StreamingSentenceSplitter();
    expect(s.push('第一句话，很长的后半句。第二句，又开始了。')).toEqual([
      '第一句话，',
      '很长的后半句。',
      '第二句，',
      '又开始了。',
    ]);
    expect(s.flush()).toEqual([]);
  });

  it('reset 清空缓冲与首逗号状态', () => {
    const s = new StreamingSentenceSplitter();
    s.push('残留内容');
    s.reset();
    expect(s.flush()).toEqual([]);
  });

  it('空 delta 安全', () => {
    const s = new StreamingSentenceSplitter();
    expect(s.push('')).toEqual([]);
    expect(s.flush()).toEqual([]);
  });
});

describe('stripForTts', () => {
  it('去除表情标签与 markdown 口语噪声', () => {
    expect(stripForTts('好的 [joy] *微笑* #标题')).toBe('好的 微笑 标题');
  });

  it('折叠空白', () => {
    expect(stripForTts('  你好\n\n世界  ')).toBe('你好 世界');
  });
});
