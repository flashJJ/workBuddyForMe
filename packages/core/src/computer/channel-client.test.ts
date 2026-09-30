import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ComputerChannelInfo, ScreenSnapshotResponse } from '@wbfm/shared';
import { ChannelUnavailableError, createComputerChannelClient } from './channel-client';

let tmpDir: string;
let infoPath: string;

const INFO: ComputerChannelInfo = {
  version: 1,
  url: 'http://127.0.0.1:59999',
  token: 'tok-abc',
  pid: 1234,
  startedAt: new Date().toISOString(),
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-chan-'));
  infoPath = path.join(tmpDir, 'computer-channel.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('computer channel client', () => {
  it('发现文件缺失 / 坏 JSON / 契约不符 → getInfo 返回 null', () => {
    const client = createComputerChannelClient({ infoPath });
    expect(client.getInfo()).toBeNull();

    fs.writeFileSync(infoPath, 'not-json');
    expect(client.getInfo()).toBeNull();

    fs.writeFileSync(infoPath, JSON.stringify({ version: 2 }));
    expect(client.getInfo()).toBeNull();
  });

  it('发现文件合法 → getInfo 返回解析结果', () => {
    fs.writeFileSync(infoPath, JSON.stringify(INFO));
    const client = createComputerChannelClient({ infoPath });
    expect(client.getInfo()).toEqual(INFO);
  });

  it('无发现文件时 snapshot 抛 ChannelUnavailableError', async () => {
    const client = createComputerChannelClient({ infoPath });
    await expect(client.snapshot({ scope: 'fullscreen' })).rejects.toBeInstanceOf(ChannelUnavailableError);
  });

  it('snapshot 发送 bearer 头并解析响应', async () => {
    fs.writeFileSync(infoPath, JSON.stringify(INFO));
    const snap: ScreenSnapshotResponse = {
      imageBase64: 'aGk=',
      mimeType: 'image/png',
      width: 100,
      height: 50,
      sourceWidth: 200,
      sourceHeight: 100,
      originX: 0,
      originY: 0,
      scaleFactor: 0.5,
    };
    let seenAuth = '';
    let seenBody = '';
    const fetchImpl: typeof fetch = (async (_url: unknown, init?: RequestInit) => {
      seenAuth = String((init?.headers as Record<string, string>).authorization ?? '');
      seenBody = String(init?.body ?? '');
      return new Response(JSON.stringify(snap), { status: 200 });
    }) as typeof fetch;

    const client = createComputerChannelClient({ infoPath, fetchImpl });
    const result = await client.snapshot({ scope: 'region', region: { x: 1, y: 2, width: 3, height: 4 } });
    expect(seenAuth).toBe(`Bearer ${INFO.token}`);
    expect(JSON.parse(seenBody)).toEqual({ scope: 'region', region: { x: 1, y: 2, width: 3, height: 4 } });
    expect(result.width).toBe(100);
  });

  it('HTTP 非 2xx / 网络错误 → ChannelUnavailableError', async () => {
    fs.writeFileSync(infoPath, JSON.stringify(INFO));
    const unauth: typeof fetch = (async () => new Response('{"error":"unauthorized"}', { status: 401 })) as typeof fetch;
    await expect(
      createComputerChannelClient({ infoPath, fetchImpl: unauth }).snapshot({ scope: 'fullscreen' }),
    ).rejects.toBeInstanceOf(ChannelUnavailableError);

    const boom: typeof fetch = (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as typeof fetch;
    await expect(
      createComputerChannelClient({ infoPath, fetchImpl: boom }).snapshot({ scope: 'fullscreen' }),
    ).rejects.toBeInstanceOf(ChannelUnavailableError);
  });

  it('非法参数在发请求前被 schema 拒绝', async () => {
    fs.writeFileSync(infoPath, JSON.stringify(INFO));
    let called = false;
    const fetchImpl: typeof fetch = (async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const client = createComputerChannelClient({ infoPath, fetchImpl });
    // 类型层面 region 可选，故意缺 region 验证运行时 refine 校验
    await expect(
      client.snapshot({ scope: 'region' } as never),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });
});
