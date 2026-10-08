import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { downloadVoiceModel, type FsLike } from './downloader';
import { getVoiceModelSpec } from './manifest';

/** 内存文件系统（key 使用 path.join 产生的平台原生路径） */
function createMemFs(): FsLike & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async mkdir() {},
    async writeFile(p, data) {
      files.set(p, data);
    },
    async stat(p) {
      const f = files.get(p);
      return f ? { size: f.length } : null;
    },
    async rename(oldPath, newPath) {
      const f = files.get(oldPath);
      if (!f) throw new Error('missing');
      files.delete(oldPath);
      files.set(newPath, f);
    },
    async rm(p) {
      files.delete(p);
    },
  };
}

function fetchImpl(responses: Record<string, Uint8Array>, failures?: Set<string>) {
  return vi.fn(async (url: string | URL | Request) => {
    const key = String(url).split('/resolve/main/')[1] ?? '';
    if (failures?.has(key)) return new Response('err', { status: 500 });
    const body = responses[key] ?? new Uint8Array();
    const stream = Readable.toWeb(Readable.from([body])) as unknown as ReadableStream<Uint8Array>;
    return new Response(stream, { status: 200 });
  }) as unknown as typeof fetch;
}

const tinySpec = (files: Array<{ path: string; size: number }>) => {
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  return { ...getVoiceModelSpec('tts', 'melo'), id: 'tiny-tts', files, totalBytes };
};

describe('downloadVoiceModel', () => {
  it('两文件模型：下载 .part → 改名，进度到 1', async () => {
    const fs = createMemFs();
    const spec = tinySpec([
      { path: 'a.txt', size: 3 },
      { path: 'dir/b.bin', size: 5 },
    ]);
    const fetchFn = fetchImpl({
      'a.txt': new Uint8Array([1, 2, 3]),
      'dir/b.bin': new Uint8Array([1, 2, 3, 4, 5]),
    });
    const progress: number[] = [];
    await downloadVoiceModel({
      spec,
      targetRoot: path.join('/data', 'voice'),
      fs,
      fetchImpl: fetchFn,
      onProgress: (p) => progress.push(p.ratio),
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
    const fetchFn = fetchImpl({});
    await downloadVoiceModel({
      spec,
      targetRoot: path.join('/data', 'voice'),
      fs,
      fetchImpl: fetchFn,
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
      fetchImpl: fetchImpl({ 'a.txt': new Uint8Array([7, 8, 9]) }),
    });
    expect([...fs.files.get(target)!]).toEqual([7, 8, 9]);
  });

  it('HTTP 非 200 抛错', async () => {
    const fs = createMemFs();
    const spec = tinySpec([{ path: 'a.txt', size: 3 }]);
    await expect(
      downloadVoiceModel({
        spec,
        targetRoot: path.join('/data', 'voice'),
        fs,
        fetchImpl: fetchImpl({}, new Set(['a.txt'])),
      }),
    ).rejects.toThrow(/HTTP 500/);
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
        fetchImpl: fetchImpl({ a: new Uint8Array() }),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
