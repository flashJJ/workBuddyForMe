import { describe, expect, it, vi } from 'vitest';
import { ProviderError, type ChatChunk } from '@wbfm/ai';
import type { Assistant, ProviderModel } from '@wbfm/shared/types';
import type { OrchestratorEvent } from '../../base/types';
import type { ResolvedChatTarget } from '../../context/model-resolver';
import {
  runProviderTurnWithModelFallback,
  type ModelFallbackTurnResult,
} from './index';

const assistant = {
  temperature: 1,
  topP: 1,
  maxTokens: null,
} as Assistant;

function model(id: string): ProviderModel {
  return {
    id,
    providerId: 'p1',
    modelId: id,
    displayName: id,
    capabilities: ['chat'],
    contextWindow: 4096,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function target(id: string, chatStream: () => AsyncIterable<ChatChunk>): ResolvedChatTarget {
  return {
    model: model(id),
    provider: {
      supportsTools: true,
      testConnection: async () => undefined,
      listModels: async () => [],
      chatStream,
      embed: async () => ({ vectors: [], dimension: 0 }),
    },
  };
}

function failing(error: Error): () => AsyncIterable<ChatChunk> {
  return () =>
    ({
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            throw error;
          },
        };
      },
    }) as unknown as AsyncIterable<ChatChunk>;
}

function streamThenFail(error: Error, text: string): () => AsyncIterable<ChatChunk> {
  return () =>
    ({
      [Symbol.asyncIterator]() {
        let step = 0;
        return {
          next: async () => {
            if (step === 0) {
              step += 1;
              return { done: false, value: { delta: text } };
            }
            throw error;
          },
        };
      },
    }) as unknown as AsyncIterable<ChatChunk>;
}

function ok(text = '好的'): () => AsyncIterable<ChatChunk> {
  return () =>
    ({
      [Symbol.asyncIterator]() {
        let step = 0;
        return {
          next: async () =>
            step === 0
              ? ((step += 1), { done: false, value: { delta: text } })
              : { done: true, value: undefined },
        };
      },
    }) as unknown as AsyncIterable<ChatChunk>;
}

async function drain(gen: AsyncGenerator<OrchestratorEvent, ModelFallbackTurnResult>) {
  const events: OrchestratorEvent[] = [];
  for (;;) {
    const step = await gen.next();
    if (step.done) return { events, result: step.value };
    events.push(step.value);
  }
}

function params(
  primary: ResolvedChatTarget,
  fallback: ResolvedChatTarget | ResolvedChatTarget[] | null,
) {
  const onSwitch = vi.fn();
  const fallbacks = fallback ? (Array.isArray(fallback) ? fallback : [fallback]) : [];
  return {
    onSwitch,
    input: {
      target: primary,
      fallbacks,
      assistant,
      messages: [{ role: 'user' as const, content: '你好' }],
      tools: [],
      hasOutput: false,
      onSwitch,
    },
  };
}

describe('v4.18 模型备用切换', () => {
  it('429 首字前切换到备用模型并完成回答', async () => {
    const { input, onSwitch } = params(
      target('primary', failing(new ProviderError({ code: 'PROVIDER_ERROR', message: 'x', status: 429 }))),
      target('fallback', ok('备用回答')),
    );
    const { events, result } = await drain(runProviderTurnWithModelFallback(input));

    expect(result.target.model.id).toBe('fallback');
    expect(result.switches).toEqual([
      { fromModelId: 'primary', toModelId: 'fallback', reason: 'rate_limited', attempt: 1 },
    ]);
    expect(events).toEqual([{ event: 'delta', data: { content: '备用回答' } }]);
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it('401 不自动切换', async () => {
    const { input, onSwitch } = params(
      target('primary', failing(new ProviderError({ code: 'PROVIDER_ERROR', message: 'x', status: 401 }))),
      target('fallback', ok()),
    );
    await expect(drain(runProviderTurnWithModelFallback(input))).rejects.toThrow('x');
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('首字后断流不自动切换', async () => {
    const broken = new ProviderError({
      code: 'PROVIDER_ERROR',
      message: '流中断',
      reason: 'stream_interrupted',
    });
    const { input, onSwitch } = params(
      target('primary', streamThenFail(broken, '半截')),
      target('fallback', ok()),
    );
    const drainPromise = drain(runProviderTurnWithModelFallback(input));
    await expect(drainPromise).rejects.toThrow('流中断');
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('备用模型也失败时停止，不来回切换', async () => {
    const { input, onSwitch } = params(
      target('primary', failing(new ProviderError({ code: 'PROVIDER_ERROR', message: 'p', status: 429 }))),
      target('fallback', failing(new ProviderError({ code: 'PROVIDER_ERROR', message: 'f', status: 503 }))),
    );
    await expect(drain(runProviderTurnWithModelFallback(input))).rejects.toThrow('f');
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it('未配置备用模型时直接抛出原始错误', async () => {
    const { input, onSwitch } = params(
      target('primary', failing(new ProviderError({ code: 'PROVIDER_ERROR', message: 'x', status: 429 }))),
      null,
    );
    await expect(drain(runProviderTurnWithModelFallback(input))).rejects.toThrow('x');
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('v4.19：按链顺序切换，第一个失败后使用第二个', async () => {
    const { input, onSwitch } = params(
      target('primary', failing(new ProviderError({ code: 'PROVIDER_ERROR', message: 'p', status: 429 }))),
      [
        target('f1', failing(new ProviderError({ code: 'PROVIDER_ERROR', message: 'f1', status: 503 }))),
        target('f2', ok('第二个备用回答')),
      ],
    );
    const { result } = await drain(runProviderTurnWithModelFallback(input));
    expect(result.target.model.id).toBe('f2');
    expect(result.switches.map((item) => item.toModelId)).toEqual(['f1', 'f2']);
    expect(onSwitch).toHaveBeenCalledTimes(2);
  });

  it('v4.19：单轮最多两次切换，第三个备用不再尝试', async () => {
    const failure = () =>
      failing(new ProviderError({ code: 'PROVIDER_ERROR', message: 'boom', status: 503 }));
    const { input, onSwitch } = params(target('primary', failure()), [
      target('f1', failure()),
      target('f2', failure()),
      target('f3', ok('不应到达')),
    ]);
    await expect(drain(runProviderTurnWithModelFallback(input))).rejects.toThrow('boom');
    expect(onSwitch).toHaveBeenCalledTimes(2);
  });
});
