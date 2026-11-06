import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deploySearxng, SEARXNG_CONTAINER, type CommandResult, type RunCommand } from './search-ipc';

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-searxng-'));
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
    return table[key] ?? { code: 1, stdout: '', stderr: `unexpected: ${args.join(' ')}` };
  };
}

const probeOk = async () => true;
const noSleep = async () => undefined;

describe('deploySearxng', () => {
  it('未安装 Docker：返回 docker_missing 与可复制的兜底命令', async () => {
    const run = makeRun({ 'version --format': { code: -1, stdout: '', stderr: 'ENOENT' } });
    const result = await deploySearxng({ dataDir, run, probe: probeOk, sleep: noSleep });
    expect(result).toMatchObject({ ok: false, reason: 'docker_missing' });
    if (!result.ok) expect(result.manualCommand).toContain('docker run -d --name wbfm-searxng');
  });

  it('Docker 守护进程未启动：返回 docker_daemon 并带原始错误', async () => {
    const run = makeRun({
      'version --format': { code: 1, stdout: '', stderr: 'error during connect: open //./pipe/docker_engine' },
    });
    const result = await deploySearxng({ dataDir, run, probe: probeOk, sleep: noSleep });
    expect(result).toMatchObject({ ok: false, reason: 'docker_daemon' });
    if (!result.ok) expect(result.message).toContain('docker_engine');
  });

  it('新建容器：写入 json 配置，映射端口并等到探活成功', async () => {
    const run = makeRun({
      'version --format': ok('27.0.0\n'),
      'inspect -f': { code: 1, stdout: '', stderr: 'No such object' },
      'run -d': ok('container-id\n'),
      'port wbfm-searxng': ok('127.0.0.1:8080\n'),
    });
    const result = await deploySearxng({
      dataDir,
      run,
      probe: probeOk,
      sleep: noSleep,
      pickPort: async () => 8080,
    });

    expect(result).toEqual({ ok: true, endpoint: 'http://127.0.0.1:8080', container: SEARXNG_CONTAINER });
    const settings = fs.readFileSync(path.join(dataDir, 'settings.yml'), 'utf8');
    expect(settings).toContain('formats:');
    expect(settings).toContain('- json');
    expect(settings).toContain('secret_key:');
  });

  it('已有容器但未运行：先 docker start，再按实际映射端口复用', async () => {
    const calls: string[] = [];
    const run: RunCommand = async (_file, args) => {
      calls.push(args.join(' '));
      const key = args.slice(0, 2).join(' ');
      if (key === 'version --format') return ok('27.0.0');
      if (key === 'inspect -f') return ok('false\n');
      if (key === 'start wbfm-searxng') return ok('');
      if (key === 'port wbfm-searxng') return ok('127.0.0.1:8090\n');
      return { code: 1, stdout: '', stderr: 'unexpected' };
    };

    const result = await deploySearxng({ dataDir, run, probe: probeOk, sleep: noSleep });
    expect(result).toEqual({ ok: true, endpoint: 'http://127.0.0.1:8090', container: SEARXNG_CONTAINER });
    expect(calls.some((c) => c.startsWith('start'))).toBe(true);
    expect(calls.some((c) => c.startsWith('run'))).toBe(false);
  });

  it('残留容器启动失败（端口被占）：清掉后用新端口重建', async () => {
    const calls: string[] = [];
    const run: RunCommand = async (_file, args) => {
      calls.push(args.join(' '));
      const key = args.slice(0, 2).join(' ');
      if (key === 'version --format') return ok('27.0.0');
      if (key === 'inspect -f') return ok('created\n');
      if (key === 'start wbfm-searxng') return { code: 1, stdout: '', stderr: 'port is already allocated' };
      if (key === 'rm -f') return ok('');
      if (key === 'run -d') return ok('new-id');
      return { code: 1, stdout: '', stderr: 'unexpected' };
    };

    const result = await deploySearxng({
      dataDir,
      run,
      probe: probeOk,
      sleep: noSleep,
      pickPort: async () => 8090,
    });

    expect(result).toEqual({ ok: true, endpoint: 'http://127.0.0.1:8090', container: SEARXNG_CONTAINER });
    expect(calls).toContain('rm -f wbfm-searxng');
    expect(calls.some((c) => c.includes('127.0.0.1:8090:8080'))).toBe(true);
  });

  it('容器起来但 JSON 未就绪：超时返回 timeout 并提示 docker logs', async () => {
    const run = makeRun({
      'version --format': ok('27.0.0'),
      'inspect -f': { code: 1, stdout: '', stderr: 'No such object' },
      'run -d': ok('container-id'),
    });
    const result = await deploySearxng({
      dataDir,
      run,
      probe: async () => false,
      sleep: noSleep,
      timeoutMs: 0,
      pickPort: async () => 8080,
    });
    expect(result).toMatchObject({ ok: false, reason: 'timeout' });
    if (!result.ok) expect(result.message).toContain('docker logs');
  });

  it('docker run 失败：返回 start_failed 且保留 stderr', async () => {
    const run = makeRun({
      'version --format': ok('27.0.0'),
      'inspect -f': { code: 1, stdout: '', stderr: 'No such object' },
      'run -d': { code: 125, stdout: '', stderr: 'port is already allocated' },
    });
    const result = await deploySearxng({
      dataDir,
      run,
      probe: probeOk,
      sleep: noSleep,
      pickPort: async () => 8080,
    });
    expect(result).toMatchObject({ ok: false, reason: 'start_failed' });
    if (!result.ok) expect(result.message).toContain('port is already allocated');
  });

  it('探活失败会重试直到成功（不是一次判定）', async () => {
    let attempts = 0;
    const run = makeRun({
      'version --format': ok('27.0.0'),
      'inspect -f': { code: 1, stdout: '', stderr: 'No such object' },
      'run -d': ok('container-id'),
    });
    const result = await deploySearxng({
      dataDir,
      run,
      sleep: noSleep,
      pickPort: async () => 8080,
      probe: async () => {
        attempts += 1;
        return attempts >= 3;
      },
    });
    expect(result.ok).toBe(true);
    expect(attempts).toBe(3);
  });

  it('配置文件已存在时保留用户手改内容', async () => {
    const file = path.join(dataDir, 'settings.yml');
    fs.writeFileSync(file, '# custom\n', 'utf8');
    const run = makeRun({ 'version --format': { code: -1, stdout: '', stderr: 'ENOENT' } });
    await deploySearxng({ dataDir, run, probe: probeOk, sleep: noSleep });
    expect(fs.readFileSync(file, 'utf8')).toBe('# custom\n');
  });
});
