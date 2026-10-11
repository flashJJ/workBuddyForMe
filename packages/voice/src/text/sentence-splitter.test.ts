import { describe, expect, it } from 'vitest';
import {
  chunkForTts,
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

  it('表格数据行：管道转逗号，单元格内容保留可读', () => {
    expect(stripForTts('| 维度 | 水平 | 依据 |')).toBe('维度，水平，依据');
  });

  it('表格分隔行/水平分隔线/代码围栏整行剔除', () => {
    expect(stripForTts('|---|:---:|---|')).toBe('');
    expect(stripForTts('------')).toBe('');
    expect(stripForTts('***')).toBe('');
    expect(stripForTts('```ts')).toBe('');
  });

  it('分隔行夹在正文中只删该行，正文保留', () => {
    expect(stripForTts('标题\n---\n正文')).toBe('标题 正文');
  });

  it('URL 整段剔除，原文标点保留', () => {
    expect(stripForTts('看 https://a.com/x?y=1 这里，')).toBe('看 这里，');
  });
});

describe('chunkForTts 超长句切块', () => {
  it('空文本返回空数组；短文本原样单块', () => {
    expect(chunkForTts('')).toEqual([]);
    expect(chunkForTts('短句子。')).toEqual(['短句子。']);
  });

  it('软标点边界贪心打包，每块不超过上限', () => {
    const text = '一二三四五，五六七八九十，一二三四五，五六七八九十。';
    const chunks = chunkForTts(text, 12);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 12)).toBe(true);
    expect(chunks.join('')).toBe(text);
  });

  it('无标点长段按字硬切且拼接无损', () => {
    const text = '甲'.repeat(95);
    const chunks = chunkForTts(text, 40);
    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.length)).toEqual([40, 40, 15]);
    expect(chunks.join('')).toBe(text);
  });

  it('英文长段优先在空格处断开', () => {
    const text = 'word '.repeat(16).trim(); // 4*16-1=63 字符
    const chunks = chunkForTts(text, 20);
    expect(chunks.every((c) => !c.startsWith(' '))).toBe(true);
    expect(chunks.join(' ')).toBe(text);
  });
});
