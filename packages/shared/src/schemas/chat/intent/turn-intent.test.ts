import { describe, expect, it } from 'vitest';
import { detectTurnIntent, extractMemoryCommand } from './turn-intent';

describe('shared 规则意图（v4.12 下沉）', () => {
  it('长任务文本命中 tool_task 并建议任务模式', () => {
    const intent = detectTurnIntent({ text: '帮我整理这三份文档，然后导出报告' });
    expect(intent.kind).toBe('tool_task');
    expect(intent.suggestedTaskMode).toBe(true);
    expect(intent.source).toBe('rule');
  });

  it('模糊寒暄回落 fallback，不误建议任务模式', () => {
    const intent = detectTurnIntent({ text: '今天天气不错' });
    expect(intent.kind).toBe('chitchat');
    expect(intent.source).toBe('fallback');
    expect(intent.suggestedTaskMode).toBe(false);
  });

  it('记忆命令只匹配句首命令式', () => {
    expect(extractMemoryCommand('记住我喜欢冰美式')).toEqual({
      action: 'remember',
      content: '我喜欢冰美式',
    });
    expect(extractMemoryCommand('我忘记带钥匙了')).toBeNull();
  });
});
