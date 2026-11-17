import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { downloadVoiceModel } from './downloader';
import { bodyResponse, createMemFs, fast, makeFetch, tinySpec } from './downloader.test-helpers';

describe('downloadVoiceModel HTTP / 续传 / 校验', () => {
  it('HTTP 500 先重试，再成功', async () => {
    const fs = createMemFs();
    const spec = tinySpec([{ path: 'a.txt', size: 3 }]);
    let calls = 0;
    const fetchFn = makeFetch(() => {
      calls += 1;
      if (calls === 1) return new Response('err', { status: 500 });
      return bodyResponse(new Uint8Array([1, 2, 3]));
    });
    await downloadVoiceModel({
      spec,
      targetRoot: path.join('/data', 'voice'),
      fs,
      fetchImpl: fetchFn,
      ...fast,
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 },
    });
    expect(calls).toBe(2);
    expect([...fs.files.get(path.join('/data', 'voice', 'tiny-tts', 'a.txt'))!]).toEqual([
      1, 2, 3,
    ]);
  });

  it('HTTP 500 重试耗尽后抛错', async () => {
    const fs = createMemFs();
    const spec = tinySpec([{ path: 'a.txt', size: 3 }]);
    await expect(
      downloadVoiceModel({
        spec,
        targetRoot: path.join('/data', 'voice'),
        fs,
        fetchImpl: makeFetch(() => new Response('err', { status: 500 })),
        ...fast,
      }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('Range 206：从 .part 续传并改名', async () => {
    const fs = createMemFs();
    const root = path.join('/data', 'voice', 'tiny-tts');
    fs.files.set(path.join(root, 'a.bin.part'), new Uint8Array([1, 2]));
    const spec = tinySpec([{ path: 'a.bin', size: 5 }]);
    const fetchFn = makeFetch((_url, init) => bodyResponse(new Uint8Array([1, 2, 3, 4, 5]), init));
    await downloadVoiceModel({
      spec,
      targetRoot: path.join('/data', 'voice'),
      fs,
      fetchImpl: fetchFn,
      ...fast,
    });
    expect([...fs.files.get(path.join(root, 'a.bin'))!]).toEqual([1, 2, 3, 4, 5]);
    expect(fs.files.has(path.join(root, 'a.bin.part'))).toBe(false);
  });

  it('流中断后从 .part 实际大小续传（第二次请求带 Range）', async () => {
    const fs = createMemFs();
    const spec = tinySpec([{ path: 'a.bin', size: 5 }]);
    let calls = 0;
    const fetchFn = makeFetch((_url, init) => {
      calls += 1;
      if (calls === 1) {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2]));
              controller.error(new Error('network reset'));
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/octet-stream',
              'content-length': '5',
            },
          },
        );
      }
      return bodyResponse(new Uint8Array([1, 2, 3, 4, 5]), init);
    });
    await downloadVoiceModel({
      spec,
      targetRoot: path.join('/data', 'voice'),
      fs,
      fetchImpl: fetchFn,
      ...fast,
    });
    expect(calls).toBe(2);
    expect([...fs.files.get(path.join('/data', 'voice', 'tiny-tts', 'a.bin'))!]).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('SHA256 不符时删除 .part 并抛错', async () => {
    const fs = createMemFs();
    const spec = tinySpec([
      {
        path: 'a.bin',
        size: 3,
        sha256: createHash('sha256').update(Buffer.from([1, 2, 3])).digest('hex'),
      },
    ]);
    await expect(
      downloadVoiceModel({
        spec,
        targetRoot: path.join('/data', 'voice'),
        fs,
        fetchImpl: makeFetch(() => bodyResponse(new Uint8Array([9, 9, 9]))),
        ...fast,
      }),
    ).rejects.toThrow(/SHA256 不符/);
    expect(fs.files.has(path.join('/data', 'voice', 'tiny-tts', 'a.bin.part'))).toBe(false);
  });

  it('200 HTML 错误页被拒绝', async () => {
    const fs = createMemFs();
    const spec = tinySpec([{ path: 'a.txt', size: 3 }]);
    await expect(
      downloadVoiceModel({
        spec,
        targetRoot: path.join('/data', 'voice'),
        fs,
        fetchImpl: makeFetch(() =>
          bodyResponse(new Uint8Array([1, 2, 3]), undefined, { contentType: 'text/html' }),
        ),
        ...fast,
      }),
    ).rejects.toThrow(/text\/html/);
  });

  it('请求挂起会超时并抛错', async () => {
    const fs = createMemFs();
    const spec = tinySpec([{ path: 'a.txt', size: 3 }]);
    const fetchFn = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    ) as unknown as typeof fetch;
    await expect(
      downloadVoiceModel({
        spec,
        targetRoot: path.join('/data', 'voice'),
        fs,
        fetchImpl: fetchFn,
        retry: { attempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
        timeout: { requestMs: 10, idleMs: 10 },
      }),
    ).rejects.toThrow(/超时/);
  });
});
