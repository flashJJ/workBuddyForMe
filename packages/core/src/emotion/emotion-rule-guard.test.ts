import { describe, expect, it } from 'vitest';
import { inferSoulEventFromUserText } from './emotion-rule-guard';

describe('规则保底 inferSoulEventFromUserText（宁漏勿伤）', () => {
  it('显式夸赞/感谢 → praise', () => {
    for (const text of [
      '你真棒',
      '干得漂亮！',
      '太厉害了吧',
      '谢谢你',
      '辛苦了',
      '好可爱',
      '爱你',
      '  做得好  ',
    ]) {
      expect(inferSoulEventFromUserText(text), text).toBe('praise');
    }
  });

  it('显式贬损 → belittle', () => {
    for (const text of ['你真笨', '太没用了', '废物', '真让人失望', '你好差劲', '讨厌你']) {
      expect(inferSoulEventFromUserText(text), text).toBe('belittle');
    }
  });

  it('同句既夸又贬时以 belittle 为准', () => {
    expect(inferSoulEventFromUserText('你很棒但这次真笨')).toBe('belittle');
  });

  it('否定窗口：不/没/别 + 词不判定', () => {
    expect(inferSoulEventFromUserText('你不棒')).toBeNull();
    expect(inferSoulEventFromUserText('没你真笨不行')).toBeNull();
    expect(inferSoulEventFromUserText('别夸了我不棒')).toBeNull();
  });

  it('问句一律不判定（哪怕含词）', () => {
    expect(inferSoulEventFromUserText('我这样算棒吗')).toBeNull();
    expect(inferSoulEventFromUserText('你是不是笨？')).toBeNull();
    expect(inferSoulEventFromUserText('厉害吗')).toBeNull();
  });

  it('普通消息/长消息/空消息 → null', () => {
    expect(inferSoulEventFromUserText('帮我写一份周报')).toBeNull();
    expect(inferSoulEventFromUserText('今天天气怎么样')).toBeNull();
    expect(inferSoulEventFromUserText('')).toBeNull();
    expect(inferSoulEventFromUserText('   ')).toBeNull();
    expect(inferSoulEventFromUserText('你'.repeat(25))).toBeNull();
  });

  it('规则能力边界：复杂长句即使含夸赞词也不判定', () => {
    // 反讽需语义理解，规则通道主动放弃长句（>24 字）避免误伤
    expect(
      inferSoulEventFromUserText('你可真厉害呢，每次都能把这么简单的事情搞成现在这个样子'),
    ).toBeNull();
  });
});
