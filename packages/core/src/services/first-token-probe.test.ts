import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseInstance, ProviderRecord } from '@wbfm/database';
import type { ChatChunk } from '@wbfm/ai';
import type { SecretCipher } from '../secrets/cipher';

const { buildProviderMock } = vi.hoisted(() => ({ buildProviderMock: vi.fn() }));

vi.mock('./provider-adapter', () => ({ buildProvider: buildProviderMock }));

import { FIRST_TOKEN_PROBE_PROMPT, probeFirstToken } from './first-token-probe';

const fakeDb = {} as DatabaseInstance;
const fakeCipher = {} as SecretCipher;
const fakeProvider = {} as ProviderRecord;
const chunk: ChatChunk = { delta: '你' };

/** 按序产出给定 chunk 的异步可迭代对象 */
function sequence(values: ChatChunk[]): AsyncIterable<ChatChunk> {
  let index = 0;
  return {
    [Symbol.asyncIterator]: () => ({
      next: () =>
        Promise.resolve(
          index < values.length
            ? { done: false as const, value: values[index++]! }
            : { done: true as const, value: undefined },
        ),
    }),
  };
}

/** 迭代即失败的异步可迭代对象 */
function failing(message: string): AsyncIterable<ChatChunk> {
  return {
    [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error(message)) }),
  };
}

/** 永不产出、仅在 signal 中断时失败的异步可迭代对象 */
function hanging(signal?: AbortSignal): AsyncIterable<ChatChunk> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: () =>
        new Promise<never>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    }),
  };
}

describe('v2.4 M1 T5 首字延迟自检', () => {
  beforeEach(() => {
    buildProviderMock.mockReset();
  });

  it('取到首字 → ok=true，返回首字延迟与总耗时；prompt 为固定常量', async () => {
    let prompt = '';
    buildProviderMock.mockReturnValue({
      chatStream: (params: { messages: { content: string }[] }) => {
        prompt = params.messages[0]!.content;
        return sequence([chunk]);
      },
    });

    const outcome = await probeFirstToken(fakeDb, fakeCipher, fakeProvider, 'm1');
    expect(outcome.ok).toBe(true);
    expect(outcome.firstTokenMs).not.toBeNull();
    expect(outcome.totalMs).not.toBeNull();
    expect(prompt).toBe(FIRST_TOKEN_PROBE_PROMPT);
  });

  it('流式报错 → ok=false（不抛错）', async () => {
    buildProviderMock.mockReturnValue({
      chatStream: () => failing('upstream boom'),
    });

    await expect(probeFirstToken(fakeDb, fakeCipher, fakeProvider, 'm1')).resolves.toEqual({
      ok: false,
      firstTokenMs: null,
      totalMs: null,
    });
  });

  it('悬挂无首字 → 超时中断后 ok=false', async () => {
    buildProviderMock.mockReturnValue({
      chatStream: (params: { signal?: AbortSignal }) => hanging(params.signal),
    });

    const outcome = await probeFirstToken(fakeDb, fakeCipher, fakeProvider, 'm1', 20);
    expect(outcome.ok).toBe(false);
    expect(outcome.firstTokenMs).toBeNull();
  });
});
