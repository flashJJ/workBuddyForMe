import { describe, expect, it, vi } from 'vitest';
import { runIntentStage } from '../intent-stage';

vi.mock('../../context/intent/intent-classifier', () => ({
  createIntentClassifier: () => null,
}));

function params(text: string) {
  const recordChat = vi.fn();
  return {
    recordChat,
    input: {
      deps: { events: { recordChat } } as never,
      assistant: { id: 'a1', knowledgeBaseIds: [], memoryEnabled: false } as never,
      memory: {} as never,
      conversationId: 'c1',
      sourceMessageId: 'm1',
      userContent: text,
      hasImages: false,
      applyMemory: false,
    },
  };
}

describe('runIntentStage（v4.12 hintApplied）', () => {
  it('高置信任务意图：记录 hintApplied=true', async () => {
    const { recordChat, input } = params('帮我整理这三份文档，然后导出报告');
    const result = await runIntentStage(input);
    expect(result.intent.kind).toBe('tool_task');
    expect(result.intent.hintApplied).toBe(true);
    expect(recordChat).toHaveBeenCalledWith(
      'c1',
      'turn_intent',
      expect.objectContaining({ hintApplied: true }),
    );
  });

  it('低置信度寒暄：记录 hintApplied=false', async () => {
    const { recordChat, input } = params('今天天气不错');
    const result = await runIntentStage(input);
    expect(result.intent.source).toBe('fallback');
    expect(result.intent.hintApplied).toBe(false);
    expect(recordChat).toHaveBeenCalledWith(
      'c1',
      'turn_intent',
      expect.objectContaining({ hintApplied: false }),
    );
  });
});
