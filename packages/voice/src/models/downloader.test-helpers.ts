import { vi } from 'vitest';
import type { DownloadModelOptions, FsLike } from './downloader';
import { getVoiceModelSpec } from './manifest';

/** 内存文件系统（key 使用 path.join 产生的平台原生路径） */
export function createMemFs(): FsLike & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async mkdir() {},
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
    async openWrite(p, options) {
      if (!options.append) files.set(p, new Uint8Array(0));
      return {
        async write(data) {
          const old = files.get(p) ?? new Uint8Array(0);
          const next = new Uint8Array(old.length + data.length);
          next.set(old);
          next.set(data, old.length);
          files.set(p, next);
        },
        async close() {},
      };
    },
    async openRead(p) {
      const data = files.get(p);
      if (!data) throw new Error('missing');
      return (async function* () {
        yield data;
      })();
    },
  };
}

export const tinySpec = (files: Array<{ path: string; size: number; sha256?: string }>) => {
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  return { ...getVoiceModelSpec('tts', 'melo'), id: 'tiny-tts', files, totalBytes };
};

export function pathOf(url: string): string {
  const marker = '/resolve/';
  const rest = url.slice(url.indexOf(marker) + marker.length);
  return rest.slice(rest.indexOf('/') + 1);
}

export function makeFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
    handler(String(url), init),
  ) as unknown as typeof fetch;
}

export function bodyResponse(
  body: Uint8Array,
  init?: RequestInit,
  options: { status?: number; contentType?: string; ignoreRange?: boolean } = {},
): Response {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const range = headers.Range ?? headers.range;
  if (range && !options.ignoreRange) {
    const start = Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0);
    const part = body.slice(start);
    return new Response(part, {
      status: 206,
      headers: {
        'content-type': options.contentType ?? 'application/octet-stream',
        'content-length': String(part.length),
        'content-range': `bytes ${start}-${body.length - 1}/${body.length}`,
      },
    });
  }
  return new Response(body, {
    status: options.status ?? 200,
    headers: {
      'content-type': options.contentType ?? 'application/octet-stream',
      'content-length': String(body.length),
    },
  });
}

export const fast: Pick<DownloadModelOptions, 'retry' | 'timeout'> = {
  retry: { attempts: 2, baseDelayMs: 1, maxDelayMs: 1 },
  timeout: { requestMs: 1_000, idleMs: 1_000 },
};
