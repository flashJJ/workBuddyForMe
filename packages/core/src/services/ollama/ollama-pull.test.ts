import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamOllamaPull, type OllamaPullProgress } from './ollama-pull';

function bodyOf(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`));
      controller.close();
    },
  });
}

function stubOk(lines: string[]) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(bodyOf(lines), { status: 200 })));
}

async function collect(): Promise<OllamaPullProgress[]> {
  const out: OllamaPullProgress[] = [];
  for await (const progress of streamOllamaPull('qwen2.5:7b')) out.push(progress);
  return out;
}

describe('v2.4 P0-1 T4 本机模型一键拉取（NDJSON → 进度）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('解析上游进度：状态与百分比；无总量行 percent 为 null', async () => {
    stubOk([
      '{"status":"pulling manifest"}',
      '{"status":"downloading","total":1000,"completed":250}',
      '{"status":"downloading","total":1000,"completed":1000}',
      '{"status":"success"}',
    ]);

    const out = await collect();
    expect(out.map((p) => p.percent)).toEqual([null, 25, 100, null]);
    expect(out[0]!.status).toBe('pulling manifest');
    expect(out[1]!.completed).toBe(250);
  });

  it('不可解析的行被忽略（半包/心跳不致命）', async () => {
    stubOk(['{"status":"pulling manifest"}', 'oops-not-json', '']);

    const out = await collect();
    expect(out).toHaveLength(1);
  });

  it('上游错误行抛错', async () => {
    stubOk(['{"status":"downloading","total":10,"completed":1}', '{"error":"disk full"}']);

    await expect(collect()).rejects.toThrow('disk full');
  });

  it('非 200 响应抛错', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })));

    await expect(collect()).rejects.toThrow('500');
  });
});
