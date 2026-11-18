import { describe, expect, it, vi } from 'vitest';
import { classifyTurnIntent, detectTurnIntent, extractMemoryCommand } from './turn-intent';

describe('detectTurnIntent（v4.8 规则意图）', () => {
  it('记住命令识别为 memory_write', () => {
    const intent = detectTurnIntent({ text: '记住我喜欢冰美式，不加糖' });
    expect(intent.kind).toBe('memory_write');
    expect(intent.source).toBe('rule');
    expect(intent.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('「我忘记带钥匙了」不是忘掉命令', () => {
    expect(extractMemoryCommand('我忘记带钥匙了')).toBeNull();
    expect(detectTurnIntent({ text: '我忘记带钥匙了' }).kind).not.toBe('memory_write');
  });

  it('忘掉命令可提取内容', () => {
    expect(extractMemoryCommand('忘掉我喜欢冰美式这件事')).toEqual({
      action: 'forget',
      content: '我喜欢冰美式这件事',
    });
  });

  it('多步工具任务建议任务模式', () => {
    const intent = detectTurnIntent({ text: '帮我整理这三份文档，然后导出报告' });
    expect(intent.kind).toBe('tool_task');
    expect(intent.suggestedTaskMode).toBe(true);
  });

  it('知识问句与追问的优先级', () => {
    expect(detectTurnIntent({ text: '什么是 RAG' }).kind).toBe('knowledge');
    expect(detectTurnIntent({ text: '刚才那个结论是什么' }).kind).toBe('follow_up');
  });

  it('低置信度回落 chitchat + fallback', () => {
    const intent = detectTurnIntent({ text: '今天天气不错' });
    expect(intent.kind).toBe('chitchat');
    expect(intent.source).toBe('fallback');
  });

  it('提醒意图', () => {
    expect(detectTurnIntent({ text: '提醒我明天九点开会' }).kind).toBe('reminder');
  });
});

describe('classifyTurnIntent（v4.8 可插拔分类器）', () => {
  it('规则高置信度时不调用分类器', async () => {
    const classifier = vi.fn();
    const intent = await classifyTurnIntent({ text: '记住我住在杭州' }, classifier, 50);
    expect(intent.source).toBe('rule');
    expect(classifier).not.toHaveBeenCalled();
  });

  it('规则低置信度时采用分类器结果', async () => {
    const classifier = vi.fn(async () => ({
      kind: 'knowledge' as const,
      confidence: 0.9,
      signals: ['small-model'],
      suggestedTaskMode: false,
      source: 'classifier' as const,
    }));
    const intent = await classifyTurnIntent({ text: '嗯' }, classifier, 50);
    expect(intent.kind).toBe('knowledge');
    expect(intent.source).toBe('classifier');
  });

  it('分类器异常时回退规则结果', async () => {
    const classifier = vi.fn(async () => {
      throw new Error('offline');
    });
    const intent = await classifyTurnIntent({ text: '嗯' }, classifier, 50);
    expect(intent.source).toBe('fallback');
    expect(intent.kind).toBe('chitchat');
  });
});
