import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCliSubagentProvider } from './cli-subagent-provider';

const FIXTURE = `
const readline = require('node:readline');
const mode = process.argv[2];
const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\\n');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type === 'run') {
    if (mode === 'done') {
      send({ type: 'delta', text: 'hello ' });
      send({ type: 'delta', text: 'world' });
      send({ type: 'done', summary: 'ok' });
      rl.close();
    } else if (mode === 'error') {
      send({ type: 'error', code: 'FAILED', message: 'boom' });
      rl.close();
    } else if (mode === 'permission') {
      send({ type: 'permission', id: 'p1', title: '写入', detail: 'README.md' });
    } else if (mode === 'flood') {
      for (let i = 0; i < 5000; i++) send({ type: 'delta', text: '0123456789' });
    } else if (mode === 'unknown') {
      send({ type: 'nope' });
    } else if (mode === 'exit') {
      process.exit(3);
    }
  } else if (msg.type === 'permission_result') {
    send({ type: 'done', summary: msg.allow ? 'allowed' : 'denied' });
    rl.close();
  }
});
`;

function fixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wbfm-cli-provider-'));
  writeFileSync(join(dir, 'agent.js'), FIXTURE, 'utf8');
  return dir;
}

function providerOf(mode: string, timeoutMs = 4_000, maxOutputBytes = 2_048) {
  const dir = fixtureDir();
  return createCliSubagentProvider({
    id: 'local-cli',
    label: 'fixture',
    command: process.execPath,
    args: [join(dir, 'agent.js'), mode],
    timeoutMs,
    maxOutputBytes,
  });
}

describe('v2.11 本地 CLI 外部代理', () => {
  it('delta 累积 + done 终态', async () => {
    const result = await providerOf('done').run({ goal: 'x', cwd: tmpdir() });
    expect(result.status).toBe('done');
    expect(result.summary).toBe('ok');
    expect(result.outputBytes).toBeGreaterThan(0);
  });

  it('permission 帧经宿主审批：允许 / 拒绝', async () => {
    const allow = await providerOf('permission').run({
      goal: 'x',
      cwd: tmpdir(),
      requestPermission: async () => true,
    });
    expect(allow.status).toBe('done');
    expect(allow.summary).toBe('allowed');

    const deny = await providerOf('permission').run({
      goal: 'x',
      cwd: tmpdir(),
      requestPermission: async () => false,
    });
    expect(deny.status).toBe('done');
    expect(deny.summary).toBe('denied');
  });

  it('error 帧收敛为 failed', async () => {
    const result = await providerOf('error').run({ goal: 'x', cwd: tmpdir() });
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('FAILED');
    expect(result.error).toBe('boom');
  });

  it('未知 type 视为协议错误并终止', async () => {
    const result = await providerOf('unknown').run({ goal: 'x', cwd: tmpdir() });
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('protocol');
  });

  it('超时 → failed(timeout) 并杀进程', async () => {
    const result = await providerOf('hang', 150).run({ goal: 'x', cwd: tmpdir() });
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('timeout');
  });

  it('输出超限 → failed(output_limit)', async () => {
    const result = await providerOf('flood', 8_000, 512).run({ goal: 'x', cwd: tmpdir() });
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('output_limit');
  });

  it('子进程提前退出 → failed(exit)', async () => {
    const result = await providerOf('exit').run({ goal: 'x', cwd: tmpdir() });
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('exit');
  });

  it('取消 → cancelled', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    const result = await providerOf('hang', 8_000).run(
      { goal: 'x', cwd: tmpdir() },
      controller.signal,
    );
    expect(result.status).toBe('cancelled');
  });

  it('命令不可用 → failed(command_unavailable)', async () => {
    const provider = createCliSubagentProvider({
      id: 'local-cli',
      label: 'fixture',
      command: join(tmpdir(), 'wbfm-missing-cli'),
      args: [],
      timeoutMs: 1_000,
      maxOutputBytes: 1_024,
    });
    expect(provider.available()).toBe(false);
    const result = await provider.run({ goal: 'x', cwd: tmpdir() });
    expect(result.errorCode).toBe('command_unavailable');
  });
});
