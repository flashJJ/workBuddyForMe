import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createProviderMock, testConnectionMock } = vi.hoisted(() => ({
  createProviderMock: vi.fn(),
  testConnectionMock: vi.fn(),
}));

vi.mock('@wbfm/ai', () => ({ createProvider: createProviderMock }));

import { LOCAL_OLLAMA_URL, probeLocalOllama } from './ollama-probe';

describe('v2.4 M1 本机 Ollama 提前探测', () => {
  beforeEach(() => {
    createProviderMock.mockReset();
    testConnectionMock.mockReset();
    createProviderMock.mockImplementation(() => ({ testConnection: testConnectionMock }));
  });

  it('探活成功 → true，且用默认地址与 ollama 协议构造适配器', async () => {
    testConnectionMock.mockResolvedValue(undefined);
    await expect(probeLocalOllama()).resolves.toBe(true);
    expect(createProviderMock).toHaveBeenCalledWith({
      protocol: 'ollama',
      baseUrl: LOCAL_OLLAMA_URL,
      apiKey: null,
    });
  });

  it('未运行 / 连接被拒 → false（探测失败不抛错）', async () => {
    testConnectionMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(probeLocalOllama()).resolves.toBe(false);
  });

  it('探活悬挂 → 超时中断后返回 false', async () => {
    testConnectionMock.mockImplementation(
      (signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    await expect(probeLocalOllama(LOCAL_OLLAMA_URL, 20)).resolves.toBe(false);
  });
});
