import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeStorage } from 'electron';
import { startCipherServer, type CipherEndpoint } from './cipher-server';

vi.mock('electron', () => ({
  safeStorage: {
    encryptStringAsync: vi.fn(async (plain: string) => Buffer.from(`enc:${plain}`)),
    decryptStringAsync: vi.fn(async (encrypted: Buffer) => ({
      result: encrypted.toString('utf8').replace(/^enc:/, ''),
      shouldReEncrypt: false,
    })),
  },
}));

let endpoint: CipherEndpoint | null = null;

async function post(
  path: '/encrypt' | '/decrypt',
  body: unknown,
  token = 'test-token',
): Promise<Response> {
  endpoint ??= await startCipherServer('test-token');
  return fetch(`${endpoint.url}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

afterEach(async () => {
  await endpoint?.close();
  endpoint = null;
  vi.clearAllMocks();
});

describe('safeStorage 回环桥（Electron 45 异步 API）', () => {
  it('缺失/错误 token 返回 401', async () => {
    const res = await post('/encrypt', { value: 'secret' }, 'wrong-token');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('加密走 encryptStringAsync，并返回 base64 密文', async () => {
    const res = await post('/encrypt', { value: 'secret' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      value: Buffer.from('enc:secret').toString('base64'),
    });
    expect(safeStorage.encryptStringAsync).toHaveBeenCalledWith('secret');
  });

  it('解密走 decryptStringAsync，并返回明文', async () => {
    const encrypted = Buffer.from('enc:hello').toString('base64');
    const res = await post('/decrypt', { value: encrypted });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'hello' });
    expect(safeStorage.decryptStringAsync).toHaveBeenCalledTimes(1);
  });

  it('非法 body 返回 422', async () => {
    const res = await post('/encrypt', { value: 123 });
    expect(res.status).toBe(422);
    expect(safeStorage.encryptStringAsync).not.toHaveBeenCalled();
  });

  it('safeStorage 抛错时返回 500，不泄露内部错误', async () => {
    vi.mocked(safeStorage.encryptStringAsync).mockRejectedValueOnce(new Error('dpapi failed'));
    const res = await post('/encrypt', { value: 'secret' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'cipher_failed' });
  });
});
