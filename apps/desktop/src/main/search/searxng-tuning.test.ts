import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deploySearxng, type CommandResult, type RunCommand } from './searxng-deploy';

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-searxng-tune-'));
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
const noSleep = async () => undefined;

describe('SearXNG 引擎调优', () => {
  it('配置文件已存在时保留用户手改内容', async () => {
    const file = path.join(dataDir, 'settings.yml');
    fs.writeFileSync(file, '# custom\n', 'utf8');
    const run = makeRun({ 'version --format': { code: -1, stdout: '', stderr: 'ENOENT' } });
    await deploySearxng({ dataDir, run, probe: probeOk, sleep: noSleep });
    expect(fs.readFileSync(file, 'utf8')).toBe('# custom\n');
  });

  it('动态调优：只保留探测到结果的引擎，其余写回禁用', async () => {
    const run = makeRun({
      'version --format': ok('27.0.0'),
      'inspect -f': { code: 1, stdout: '', stderr: 'No such object' },
      'run -d': ok('container-id'),
    });
    const result = await deploySearxng({
      dataDir,
      run,
      probe: probeOk,
      probeEngine: async (_endpoint, engine) => engine === 'sogou' || engine === '360search',
      sleep: noSleep,
      pickPort: async () => 8080,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.engines).toEqual(['sogou', '360search']);
    const settings = fs.readFileSync(path.join(dataDir, 'settings.yml'), 'utf8');
    expect(settings).toMatch(/- name: "sogou"\n {4}disabled: false/);
    expect(settings).toMatch(/- name: "360search"\n {4}disabled: false/);
    expect(settings).toMatch(/- name: "brave"\n {4}disabled: true/);
  });

  it('动态调优：全部引擎不可用时保留候选全开并返回空列表', async () => {
    const run = makeRun({
      'version --format': ok('27.0.0'),
      'inspect -f': { code: 1, stdout: '', stderr: 'No such object' },
      'run -d': ok('container-id'),
    });
    const result = await deploySearxng({
      dataDir,
      run,
      probe: probeOk,
      probeEngine: async () => false,
      sleep: noSleep,
      pickPort: async () => 8080,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.engines).toEqual([]);
    const settings = fs.readFileSync(path.join(dataDir, 'settings.yml'), 'utf8');
    expect(settings).toMatch(/- name: "sogou"\n {4}disabled: false/);
  });

  it('用户手改配置（无托管标记）不自动调优，也不改写文件', async () => {
    const file = path.join(dataDir, 'settings.yml');
    fs.writeFileSync(file, 'use_default_settings: true\n', 'utf8');
    let probed = 0;
    const run = makeRun({
      'version --format': ok('27.0.0'),
      'inspect -f': { code: 1, stdout: '', stderr: 'No such object' },
      'run -d': ok('container-id'),
    });
    const result = await deploySearxng({
      dataDir,
      run,
      probe: probeOk,
      probeEngine: async () => {
        probed += 1;
        return true;
      },
      sleep: noSleep,
      pickPort: async () => 8080,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.engines).toBeUndefined();
    expect(probed).toBe(0);
    expect(fs.readFileSync(file, 'utf8')).toBe('use_default_settings: true\n');
  });
});
