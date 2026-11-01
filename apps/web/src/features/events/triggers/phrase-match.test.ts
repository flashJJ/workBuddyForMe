import { describe, expect, it } from 'vitest';
import { matchAnyPhrase, normalizePhrase } from './phrase-match';

describe('normalizePhrase', () => {
  it('小写、NFKC 全角折叠、空白压缩', () => {
    // NFKC：全角空格→半角、全角感叹号→半角；连续空白压缩
    expect(normalizePhrase('  晚安　！  Good  Night ')).toBe('晚安 ! good night');
    expect(normalizePhrase('Ｇｏｏｄ')).toBe('good');
  });
});

describe('matchAnyPhrase', () => {
  it('中文包含命中（忽略大小写/空白）', () => {
    expect(matchAnyPhrase('我先去睡了，明天聊', ['睡了'])).toBe(true);
    expect(matchAnyPhrase('GOOD NIGHT everyone', ['good night'])).toBe(true);
  });

  it('英文短词要求词边界，不命中词中片段', () => {
    expect(matchAnyPhrase('the signature is valid', ['gn'])).toBe(false);
    expect(matchAnyPhrase('gn!', ['gn'])).toBe(true);
    expect(matchAnyPhrase('say goodnight now', ['goodnight'])).toBe(true);
  });

  it('空文本/空词表/空短语恒 false', () => {
    expect(matchAnyPhrase('', ['晚安'])).toBe(false);
    expect(matchAnyPhrase('晚安', [])).toBe(false);
    expect(matchAnyPhrase('晚安', ['  '])).toBe(false);
  });
});
