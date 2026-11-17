import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBackgroundIpc, type BackgroundIpcMainLike } from './background-ipc';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let root = '';
let dir = '';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-bg-ipc-'));
  dir = path.join(root, 'backgrounds');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function fakeIpc() {
  const handlers = new Map<string, (event: { sender?: unknown }, ...args: unknown[]) => unknown>();
  const ipc: BackgroundIpcMainLike = {
    handle: (channel, listener) => {
      handlers.set(channel, listener);
    },
  };
  return { ipc, handlers };
}

describe('v4.4 M2 背景 IPC', () => {
  it('主窗选择后复制并返回描述符', async () => {
    const source = path.join(root, 'pick.png');
    fs.writeFileSync(source, PNG);
    const { ipc, handlers } = fakeIpc();
    registerBackgroundIpc(ipc, {
      dir,
      fromMain: (sender) => sender === 'main',
      pickFile: vi.fn(async () => source),
    });

    const result = await handlers.get('background:pick')!({ sender: 'main' });
    expect(result).toMatchObject({ canceled: false, file: { kind: 'image' } });
  });

  it('取消选择返回 canceled', async () => {
    const { ipc, handlers } = fakeIpc();
    registerBackgroundIpc(ipc, { dir, fromMain: () => true, pickFile: async () => null });
    expect(await handlers.get('background:pick')!({ sender: 'main' })).toEqual({ canceled: true });
  });

  it('非主窗调用被拒绝', async () => {
    const { ipc, handlers } = fakeIpc();
    registerBackgroundIpc(ipc, { dir, fromMain: (sender) => sender === 'main' });
    expect(await handlers.get('background:pick')!({ sender: 'pet' })).toEqual({ canceled: true });
    expect(await handlers.get('background:list')!({ sender: 'pet' })).toEqual([]);
    expect(await handlers.get('background:remove')!({ sender: 'pet' }, 'x.png')).toBe(false);
  });

  it('list 与 remove 走同一受控目录', async () => {
    const source = path.join(root, 'a.png');
    fs.writeFileSync(source, PNG);
    const { ipc, handlers } = fakeIpc();
    registerBackgroundIpc(ipc, { dir, fromMain: () => true, pickFile: async () => source });

    const picked = (await handlers.get('background:pick')!({ sender: 'main' })) as {
      file: { id: string };
    };
    const list = (await handlers.get('background:list')!({ sender: 'main' })) as unknown[];
    expect(list).toHaveLength(1);
    expect(await handlers.get('background:remove')!({ sender: 'main' }, picked.file.id)).toBe(true);
    expect(await handlers.get('background:list')!({ sender: 'main' })).toHaveLength(0);
  });
});
