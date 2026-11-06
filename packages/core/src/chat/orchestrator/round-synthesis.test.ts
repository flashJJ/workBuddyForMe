import { describe, expect, it } from 'vitest';
import { ROUND_LIMIT_FALLBACK } from './orchestrator-helpers';
import { ROUND_SYNTHESIS_PROMPT, synthesizeFinalAnswer } from './round-synthesis';

type Chunk = {
  delta?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
};

function makeTarget(chunks: Chunk[], capture?: (params: Record<string, unknown>) => void) {
  return {
    model: { modelId: 'test-model' },
    provider: {
      chatStream: (params: Record<string, unknown>) => {
        capture?.(params);
        return (async function* () {
          for (const chunk of chunks) yield chunk;
        })();
      },
    },
  } as never;
}

const ASSISTANT = { temperature: 1, topP: 1, maxTokens: null } as never;

async function collect<T>(gen: AsyncGenerator<unknown, T>) {
  const events: unknown[] = [];
  for (;;) {
    const step = await gen.next();
    if (step.done) return { events, result: step.value };
    events.push(step.value);
  }
}

describe('工具轮耗尽后的收尾轮', () => {
  it('不挂工具，并把增量文本聚合成回答', async () => {
    let captured: Record<string, unknown> = {};
    const target = makeTarget(
      [
        { delta: '今日要点：' },
        { delta: '大模型发布与融资各一。' },
        { usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 } },
      ],
      (params) => {
        captured = params;
      },
    );

    const { events, result } = await collect(
      synthesizeFinalAnswer({ target, assistant: ASSISTANT, outgoing: [] }),
    );

    expect(captured.tools).toBeUndefined();
    expect(result.content).toBe('今日要点：大模型发布与融资各一。');
    expect(result.usage?.totalTokens).toBe(120);
    expect(events).toHaveLength(2);
  });

  it('收尾指令作为最后一条 user 消息追加，不改动已有上下文', async () => {
    let captured: { messages?: Array<{ role: string; content: string | null }> } = {};
    const outgoing = [
      { role: 'user', content: '搜索今天的大事' },
      { role: 'tool', content: '搜索结果……' },
    ] as never;
    const target = makeTarget([{ delta: '结论' }], (params) => {
      captured = params as typeof captured;
    });

    await collect(synthesizeFinalAnswer({ target, assistant: ASSISTANT, outgoing }));

    const messages = captured.messages ?? [];
    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({ role: 'user', content: '搜索今天的大事' });
    expect(messages[2]).toMatchObject({ role: 'user', content: ROUND_SYNTHESIS_PROMPT });
  });

  it('收尾轮仍无文本时退回兜底文案', async () => {
    const target = makeTarget([]);
    const { result } = await collect(
      synthesizeFinalAnswer({ target, assistant: ASSISTANT, outgoing: [] }),
    );
    expect(result.content).toBe(ROUND_LIMIT_FALLBACK);
  });
});
