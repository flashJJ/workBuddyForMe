import { describe, expect, it } from 'vitest';
import { ProviderError, type ChatProvider } from '@wbfm/ai';
import type { Assistant } from '@wbfm/shared/types';
import type { ProviderModel } from '@wbfm/shared/types';
import { runProviderTurnWithToolFallback } from '../tool-runner';
import type { OrchestratorEvent } from '../../base/types';

const messages = [
  { role: 'system' as const, content: 'sys' },
  { role: 'user' as const, content: '第一轮问题' },
  { role: 'assistant' as const, content: '第一轮回答' },
  { role: 'user' as const, content: '第二轮问题' },
  { role: 'assistant' as const, content: '第二轮回答' },
  { role: 'user' as const, content: '第三轮问题' },
];

function paramsWith(provider: ChatProvider) {
  return {
    target: { provider, model: { modelId: 'm1' } as ProviderModel },
    assistant: { temperature: 1, topP: 1, maxTokens: null } as unknown as Assistant,
    messages,
    tools: [],
    signal: undefined,
    traceParent: null,
  };
}

describe('runProviderTurnWithToolFallback：上下文溢出自动重试', () => {
  it('首次返回 context_length_exceeded 时缩上下文重试一次', async () => {
    const lengths: number[] = [];
    const provider = {
      async *chatStream(input: { messages: unknown[] }) {
        lengths.push(input.messages.length);
        if (lengths.length === 1) {
          throw new ProviderError({
            code: 'PROVIDER_ERROR',
            message: '上游返回 400（context_length_exceeded）',
            providerMessage: 'context_length_exceeded',
          });
        }
        yield { delta: '重试成功' };
      },
    } as unknown as ChatProvider;

    const generator = runProviderTurnWithToolFallback(paramsWith(provider));
    const events: OrchestratorEvent[] = [];
    let step = await generator.next();
    while (!step.done) {
      events.push(step.value);
      step = await generator.next();
    }

    expect(step.value.content).toBe('重试成功');
    expect(lengths).toHaveLength(2);
    expect(lengths[1]!).toBeLessThan(lengths[0]!);
    expect(events.some((event) => event.event === 'delta')).toBe(true);
  });

  it('非上下文错误原样抛出，不重试', async () => {
    let calls = 0;
    const provider = {
      // 故意不 yield：用于验证非上下文错误会原样抛出
      // eslint-disable-next-line require-yield
      async *chatStream() {
        calls += 1;
        throw new ProviderError({ code: 'PROVIDER_ERROR', message: '上游返回 500' });
      },
    } as unknown as ChatProvider;

    const generator = runProviderTurnWithToolFallback(paramsWith(provider));
    await expect(generator.next()).rejects.toThrow('上游返回 500');
    expect(calls).toBe(1);
  });
});
