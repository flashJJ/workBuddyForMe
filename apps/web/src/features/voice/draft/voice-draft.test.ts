import { describe, expect, it } from 'vitest';
import { appendVoiceText, replaceVoiceSegment } from './voice-draft';

describe('v2.25 PTT 识别文本入草稿', () => {
  it('空草稿直接写入；非空换行追加，不覆盖已有内容', () => {
    expect(appendVoiceText('', '你好')).toBe('你好');
    expect(appendVoiceText('   ', '你好')).toBe('你好');
    expect(appendVoiceText('已有内容', '你好')).toBe('已有内容\n你好');
    expect(appendVoiceText('已有内容\n', '你好')).toBe('已有内容\n你好');
    expect(appendVoiceText('已有内容', '   ')).toBe('已有内容');
  });

  it('原文唯一命中才替换润色结果', () => {
    expect(replaceVoiceSegment('你好 世界', '你好', '你好，')).toBe('你好， 世界');
    expect(replaceVoiceSegment('你好 你好', '你好', '你好，')).toBeNull();
    expect(replaceVoiceSegment('别的', '你好', '你好，')).toBeNull();
    expect(replaceVoiceSegment('你好', '你好', '你好')).toBeNull();
  });
});
