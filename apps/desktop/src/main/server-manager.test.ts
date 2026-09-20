import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChildProcess, ForkOptions } from 'node:child_process';
import { startManagedServer, stopChild } from './server-manager';

interface ForkCall {
  serverPath: string;
  args: string[];
  options: ForkOptions;
}

function makeFakeChild(): { child: ChildProcess; calls: ForkCall[] } {
  const calls: ForkCall[] = [];
  const emitter = new EventEmitter();
  const kill = vi.fn((signal?: string) => {
    queueMicrotask(() => emitter.emit('exit', signal === 'SIGKILL' ? 137 : 0));
    return true;
  });
  const child = {
    pid: 4321,
    killed: false,
    exitCode: null,
    stdout: null,
    stderr: null,
    kill: kill as unknown as ChildProcess['kill'],
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    emit: emitter.emit.bind(emitter),
  } as unknown as ChildProcess;
  return { child, calls };
}

describe('server-manager 生命周期（TR-30.1）', () => {
  const tempDirs: string[] = [];
  const makeDir = () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wbfm-desktop-'));
    tempDirs.push(dir);
    return dir;
  };

  afterEach(() => {
    tempDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  });

  it('fork 时注入端口/token/数据根/托管标记与 cipher 引导，就绪后返回实例', async () => {
    const userDataDir = makeDir();
    const { child } = makeFakeChild();
    const forkImpl = vi.fn((serverPath: string, args: string[], options: ForkOptions) => {
      expect(serverPath).toBe('/fake/server.js');
      return child;
    });
    const waitImpl = vi.fn(async () => undefined);

    const server = await startManagedServer({
      userDataDir,
      serverPath: '/fake/server.js',
      cipher: { url: 'http://127.0.0.1:53000', token: 'cipher-tok' },
      forkImpl,
      waitImpl,
      portPicker: async () => 51999,
    });

    expect(server.url).toBe('http://127.0.0.1:51999');
    expect(server.token).toMatch(/^[0-9a-f]{48}$/);
    expect(waitImpl).toHaveBeenCalledWith(server.url, server.token, expect.objectContaining({ timeoutMs: 30000 }));

    const options = forkImpl.mock.calls[0]?.[2] as ForkOptions;
    expect(options.env?.PORT).toBe('51999');
    expect(options.env?.HOSTNAME).toBe('127.0.0.1');
    expect(options.env?.WBFM_SERVER_MANAGED).toBe('1');
    expect(options.env?.WBFM_TOKEN).toBe(server.token);
    expect(options.env?.WBFM_DATA_ROOT).toBe(path.join(userDataDir, 'data'));
    expect(options.execArgv?.some((a) => String(a).includes('cipher-bootstrap.cjs'))).toBe(true);

    const bootstrap = readFileSync(path.join(userDataDir, 'cipher-bootstrap.cjs'), 'utf8');
    expect(bootstrap).toContain('http://127.0.0.1:53000');
    expect(bootstrap).toContain('cipher-tok');
  });

  it('stop 先 SIGTERM 并在退出时 resolve（TR-30.1）', async () => {
    const { child } = makeFakeChild();
    await stopChild(child, 1000);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
