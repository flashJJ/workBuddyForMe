import { describe, expect, it } from 'vitest';
import { createDefaultEmotionState } from '@wbfm/shared/schemas';
import { EMOTION_DIRECTIVE_BLOCK, buildEmotionStateBlock } from './emotion-prompt';

describe('情绪模型边界文本（v1.6）', () => {
  it('协议指令块包含三字段说明与 8 个情绪词', () => {
    expect(EMOTION_DIRECTIVE_BLOCK).toContain('情绪信号协议');
    expect(EMOTION_DIRECTIVE_BLOCK).toContain('soulEvent');
    for (const word of ['neutral', 'joy', 'anger', 'sadness', 'surprise', 'disgust', 'fear', 'smirk']) {
      expect(EMOTION_DIRECTIVE_BLOCK).toContain(word);
    }
    for (const event of ['praise', 'belittle', 'chat']) {
      expect(EMOTION_DIRECTIVE_BLOCK).toContain(event);
    }
  });

  it('状态块：默认初值渲染为平静/逐渐熟悉/比较亲近/无', () => {
    const block = buildEmotionStateBlock(createDefaultEmotionState(Date.now()));
    expect(block).toContain('【当前情绪状态】');
    expect(block).toContain('心情：无明显情绪');
    expect(block).toContain('生气：无明显情绪');
    expect(block).toContain('难过：无明显情绪');
    expect(block).toContain('亲密度：还陌生');
    expect(block).toContain('信任度：逐渐熟悉');
    expect(block).toContain('当前需求：无');
    expect(block).toContain('不要宣称自己修改了');
  });

  it('高开心/低落/高亲密走对应中文等级', () => {
    const high = createDefaultEmotionState(Date.now());
    high.mood.happiness = 80;
    high.relation.intimacy = 90;
    high.relation.trust = 10;
    const block = buildEmotionStateBlock(high);
    expect(block).toContain('心情：很强烈');
    expect(block).toContain('亲密度：非常亲密');
    expect(block).toContain('信任度：还陌生');

    const low = createDefaultEmotionState(Date.now());
    low.mood.happiness = -60;
    const lowBlock = buildEmotionStateBlock(low);
    expect(lowBlock).toContain('心情：明显低落');
  });

  it('need 渲染中文需求', () => {
    const state = createDefaultEmotionState(Date.now());
    state.currentNeed = 'comfort';
    expect(buildEmotionStateBlock(state)).toContain('当前需求：需要安慰');
  });
});
