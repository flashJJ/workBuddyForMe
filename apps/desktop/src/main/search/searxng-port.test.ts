import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deploySearxng, type CommandResult, type RunCommand } from './searxng-deploy';

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-searxng-port-'));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function ok(stdout = ''): CommandResult {
  return { code: 0, stdout, stderr: '' };
}

/** 按 docker 子命令分派；未声明的命令一律失败，避免测试误通过 */
function makeRun(table: Record<string, CommandResult>): RunCommand {
  return async (_file, args) => {
    const key = args.slice(0, 2).join(' ');
    if (key === 'restart wbfm-searxng') return ok('');
    return table[key] ?? { code: 1, stdout: '', stderr: `unexpected: ${args.join(' ')}` };
  };
}

const probeOk = async () => true;
const enginesOk = async () => true;
const noSleep = async () => undefined;

describe('deploySearxng 自定义端口', () => {
  it('自定义端口被占用：直接失败并给出换端口提示', async () => {
    const run = makeRun({
      'version --format': ok('27.0.0'),
      'inspect -f': { code: 1, stdout: '', stderr: 'No such object' },
    });
    const result = await deploySearxng({
      dataDir,
      run,
      probe: probeOk,
      sleep: noSleep,
      requestedPort: 42390,
      isPortAvailable: async () => false,
    });
    expect(result).toMatchObject({ ok: false, reason: 'start_failed' });
    if (!result.ok) {
      expect(result.message).toContain('42390');
      expect(result.manualCommand).toContain('127.0.0.1:42390');
    }
  });

  it('已有容器端口不同：先删容器再按新端口重建', async () => {
    const calls: string[] = [];
    const run: RunCommand = async (_file, args) => {
      calls.push(args.join(' '));
      const key = args.slice(0, 2).join(' ');
      if (key === 'version --format') return ok('27.0.0');
      if (key === 'inspect -f') return ok('true\n');
      if (key === 'port wbfm-searxng') return ok('127.0.0.1:8090\n');
      if (key === 'rm -f') return ok('');
      if (key === 'run -d') return ok('new-id');
      if (key === 'restart wbfm-searxng') return ok('');
      return { code: 1, stdout: '', stderr: 'unexpected' };
    };

    const result = await deploySearxng({
      dataDir,
      run,
      probe: probeOk,
      probeEngine: enginesOk,
      sleep: noSleep,
      requestedPort: 42390,
      isPortAvailable: async () => true,
    });

    expect(result).toMatchObject({ ok: true, endpoint: 'http://127.0.0.1:42390' });
    expect(calls).toContain('rm -f wbfm-searxng');
    expect(calls.some((c) => c.includes('127.0.0.1:42390:8080'))).toBe(true);
  });

  it('非法端口：1024 以下或超出 65535 直接拒绝', async () => {
    const run = makeRun({ 'version --format': ok('27.0.0') });
    const result = await deploySearxng({
      dataDir,
      run,
      probe: probeOk,
      sleep: noSleep,
      requestedPort: 80,
    });
    expect(result).toMatchObject({ ok: false, reason: 'start_failed' });
    if (!result.ok) expect(result.message).toContain('1024..65535');
  });
});
