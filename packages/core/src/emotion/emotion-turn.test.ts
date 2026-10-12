import { describe, expect, it } from 'vitest';
import { resolveTurnEmotion } from './emotion-turn';

describe('resolveTurnEmotion 单回合情绪回落链', () => {
  it('模型合规尾块（围栏）：source=model，正文剥离，信号保留', () => {
    const resolved = resolveTurnEmotion(
      '今天辛苦啦，早点休息。\n```json\n{"emotion":"sadness","intensity":0.55,"soulEvent":"chat"}\n```',
      '我加完班了',
    );
    expect(resolved.source).toBe('model');
    expect(resolved.content).toBe('今天辛苦啦，早点休息。');
    expect(resolved.signal).toEqual({ emotion: 'sadness', intensity: 0.55, soulEvent: 'chat' });
  });

  it('模型裸对象尾块：source=model', () => {
    const resolved = resolveTurnEmotion('好的。\n{"emotion":"joy","soulEvent":"praise"}', '你真棒');
    expect(resolved.source).toBe('model');
    expect(resolved.content).toBe('好的。');
    expect(resolved.signal.emotion).toBe('joy');
    expect(resolved.signal.intensity).toBe(0.6);
  });

  it('脏尾块（词表外/越界）：逐叶回落仍算 model，不报错', () => {
    const resolved = resolveTurnEmotion(
      '正文\n```json\n{"emotion":"weird","intensity":-3,"soulEvent":9}\n```',
      '嗯嗯',
    );
    expect(resolved.source).toBe('model');
    expect(resolved.signal).toEqual({ emotion: 'neutral', intensity: 0.6, soulEvent: 'chat' });
  });

  it('无尾块 + 显式夸赞 → rule/praise，正文原样', () => {
    const resolved = resolveTurnEmotion('哈哈谢谢夸奖。', '你今天真厉害');
    expect(resolved.source).toBe('rule');
    expect(resolved.signal.soulEvent).toBe('praise');
    expect(resolved.signal.emotion).toBe('neutral');
    expect(resolved.content).toBe('哈哈谢谢夸奖。');
  });

  it('无尾块 + 显式贬损 → rule/belittle', () => {
    const resolved = resolveTurnEmotion('抱歉，我再试一次。', '你真笨');
    expect(resolved.source).toBe('rule');
    expect(resolved.signal.soulEvent).toBe('belittle');
  });

  it('无尾块 + 普通消息 → default/chat', () => {
    const resolved = resolveTurnEmotion('北京今天晴。', '北京天气怎么样');
    expect(resolved.source).toBe('default');
    expect(resolved.signal).toEqual({ emotion: 'neutral', intensity: 0.6, soulEvent: 'chat' });
  });

  it('正文末尾的普通 JSON 示例不被当尾块（规则/默认路径正文完整）', () => {
    const content = '配置示例：\n```json\n{"name":"demo","emotion":"joy"}\n```';
    const resolved = resolveTurnEmotion(content, '你真棒');
    expect(resolved.source).toBe('rule');
    expect(resolved.content).toBe(content);
  });
});
