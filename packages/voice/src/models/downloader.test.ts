import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { downloadVoiceModel } from './downloader';
import { bodyResponse, createMemFs, fast, makeFetch, pathOf, tinySpec } from './downloader.test-helpers';

describe('downloadVoiceModel', () => {
  it('两文件模型：下载 .part → 改名，进度到 1', async () => {
    const fs = createMemFs();
    const spec = tinySpec([
      { path: 'a.txt', size: 3 },
      { path: 'dir/b.bin', size: 5 },
    ]);
    const fetchFn = makeFetch((url) => {
      const body =
        pathOf(url) === 'a.txt' ? new Uint8Array([1, 2, 3]) : new Uint8Array([1, 2, 3, 4, 5]);
      return bodyResponse(body);
    });
    const progress: number[] = [];
    await downloadVoiceModel({
      spec,
      targetRoot: path.join('/data', 'voice'),
      fs,
      fetchImpl: fetchFn,
      onProgress: (p) => progress.push(p.ratio),
      ...fast,
    });
    expect(fs.files.get(path.join('/data', 'voice', 'tiny-tts', 'a.txt'))).toHaveLength(3);
    expect(fs.files.get(path.join('/data', 'voice', 'tiny-tts', 'dir', 'b.bin'))).toHaveLength(5);
    expect(fs.files.has(path.join('/data', 'voice', 'tiny-tts', 'a.txt.part'))).toBe(false);
    expect(progress.at(-1)).toBe(1);
  });

  it('已存在且大小匹配的文件跳过下载', async () => {
    const fs = createMemFs();
    const existing = path.join('/data', 'voice', 'tiny-tts', 'a.txt');
    fs.files.set(existing, new Uint8Array([1, 2, 3]));
    const spec = tinySpec([{ path: 'a.txt', size: 3 }]);
    const fetchFn = makeFetch(() => bodyResponse(new Uint8Array()));
    await downloadVoiceModel({
      spec,
      targetRoot: path.join('/data', 'voice'),
      fs,
      fetchImpl: fetchFn,
      ...fast,
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('大小不符的旧文件重新下载', async () => {
    const fs = createMemFs();
    const target = path.join('/data', 'voice', 'tiny-tts', 'a.txt');
    fs.files.set(target, new Uint8Array([1]));
    const spec = tinySpec([{ path: 'a.txt', size: 3 }]);
    await downloadVoiceModel({
      spec,
      targetRoot: path.join('/data', 'voice'),
      fs,
      fetchImpl: makeFetch(() => bodyResponse(new Uint8Array([7, 8, 9]))),
      ...fast,
    });
    expect([...fs.files.get(target)!]).toEqual([7, 8, 9]);
  });

  it('信号已取消：不下载并抛 name=AbortError', async () => {
    const fs = createMemFs();
    const controller = new AbortController();
    controller.abort();
    const spec = tinySpec([{ path: 'a.txt', size: 3 }]);
    await expect(
      downloadVoiceModel({
        spec,
        targetRoot: path.join('/data', 'voice'),
        fs,
        signal: controller.signal,
        fetchImpl: makeFetch(() => bodyResponse(new Uint8Array([1, 2, 3]))),
        ...fast,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
