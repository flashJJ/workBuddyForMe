import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ScreenSnapshotResponse } from '@wbfm/shared/schemas';
import {
  removeChannelDiscovery,
  startComputerChannel,
  writeChannelDiscovery,
  type ComputerChannel,
} from './control-channel';

const FAKE_SNAPSHOT: ScreenSnapshotResponse = {
  imageBase64: Buffer.from('png-bytes').toString('base64'),
  mimeType: 'image/png',
  width: 800,
  height: 600,
  sourceWidth: 800,
  sourceHeight: 600,
  originX: 0,
  originY: 0,
  scaleFactor: 1,
};

let channel: ComputerChannel | null = null;
let tmpDir: string | null = null;

afterEach(async () => {
  await channel?.close();
  channel = null;
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
});

async function post(url: string, token: string | null, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

describe('控制通道（M2 键鼠/窗口/UIA 路由）', () => {
  it('输入路由透传参数并返回 ok', async () => {
    const got: unknown[] = [];
    channel = await startComputerChannel({
      handlers: {
        snapshot: async () => FAKE_SNAPSHOT,
        mouseClick: async (args) => {
          got.push(args);
          return { ok: true };
        },
        mousePosition: async () => ({ x: 3, y: 4 }),
      },
    });
    const click = await post(`${channel.url}/input/mouse-click`, channel.token, { x: 10, y: 20 });
    expect(click.status).toBe(200);
    // schema 默认值补全（button/double）
    expect(got).toEqual([{ x: 10, y: 20, button: 'left', double: false }]);
    const pos = await post(`${channel.url}/input/mouse-position`, channel.token, {});
    expect(pos.json).toEqual({ x: 3, y: 4 });
  });

  it('handler 未注入的能力返回 404 capability_unavailable', async () => {
    channel = await startComputerChannel({ handlers: { snapshot: async () => FAKE_SNAPSHOT } });
    const res = await post(`${channel.url}/input/mouse-click`, channel.token, { x: 1, y: 2 });
    expect(res.status).toBe(404);
    expect((res.json as { error: string }).error).toBe('capability_unavailable');
  });

  it('输入路由参数非法返回 422（负数坐标 / 未知键名）', async () => {
    channel = await startComputerChannel({
      handlers: { snapshot: async () => FAKE_SNAPSHOT, mouseMove: async () => ({ ok: true as const }) },
    });
    expect((await post(`${channel.url}/input/mouse-move`, channel.token, { x: -1, y: 0 })).status).toBe(422);
    expect((await post(`${channel.url}/input/keyboard-press`, channel.token, { keys: ['win'] })).status).toBe(422);
  });
});

describe('控制通道（屏幕感知）', () => {
  it('无 token / 错 token 返回 401', async () => {
    channel = await startComputerChannel({ handlers: { snapshot: async () => FAKE_SNAPSHOT } });
    const base = `${channel.url}/screen/snapshot`;
    expect((await post(base, null, {})).status).toBe(401);
    expect((await post(base, 'wrong', {})).status).toBe(401);
  });

  it('未知路径返回 404', async () => {
    channel = await startComputerChannel({ handlers: { snapshot: async () => FAKE_SNAPSHOT } });
    expect((await post(`${channel.url}/other`, channel.token, {})).status).toBe(404);
  });

  it('非法参数返回 422（region 缺 region / scope 未知）', async () => {
    channel = await startComputerChannel({ handlers: { snapshot: async () => FAKE_SNAPSHOT } });
    const base = `${channel.url}/screen/snapshot`;
    expect((await post(base, channel.token, { scope: 'region' })).status).toBe(422);
    expect((await post(base, channel.token, { scope: 'window' })).status).toBe(422);
  });

  it('正常截图返回 200 与完整契约', async () => {
    channel = await startComputerChannel({ handlers: { snapshot: async () => FAKE_SNAPSHOT } });
    const { status, json } = await post(`${channel.url}/screen/snapshot`, channel.token, { scope: 'fullscreen' });
    expect(status).toBe(200);
    const snap = json as ScreenSnapshotResponse;
    expect(snap.mimeType).toBe('image/png');
    expect(snap.width).toBe(800);
    expect(snap.scaleFactor).toBe(1);
    expect(Buffer.from(snap.imageBase64, 'base64').toString()).toBe('png-bytes');
  });

  it('handler 抛异常返回 500', async () => {
    channel = await startComputerChannel({
      handlers: {
        snapshot: async () => {
          throw new Error('boom');
        },
      },
    });
    expect((await post(`${channel.url}/screen/snapshot`, channel.token, {})).status).toBe(500);
  });

  it('发现文件写入后可读回、删除后不存在', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-channel-'));
    const file = path.join(tmpDir, 'computer-channel.json');
    channel = await startComputerChannel({ handlers: { snapshot: async () => FAKE_SNAPSHOT } });
    writeChannelDiscovery(file, {
      version: 1,
      url: channel.url,
      token: channel.token,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });
    const info = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(info.url).toBe(channel.url);
    expect(info.token).toBe(channel.token);
    // 用读回的 token 实际调用一次，验证发现文件端到端可用
    expect((await post(`${info.url}/screen/snapshot`, info.token, {})).status).toBe(200);

    removeChannelDiscovery(file);
    expect(fs.existsSync(file)).toBe(false);
    // 再删一次不抛错
    removeChannelDiscovery(file);
  });
});
