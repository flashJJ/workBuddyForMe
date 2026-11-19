import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * v4.11 P1-3：Electron 联网冒烟的共享常量。
 * 端口与 Web E2E（43102）、离线验收（43101）错开。
 */
export const FIXTURE_PORT = Number(process.env.WBFM_DESKTOP_FIXTURE_PORT ?? 43103);
export const FIXTURE_URL = `http://127.0.0.1:${FIXTURE_PORT}`;
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/** 配置加载时生成已替换夹具地址的场景文件，Electron 子进程通过 env 读取 */
const scenarioDir = mkdtempSync(path.join(tmpdir(), 'wbfm-desktop-scenario-'));
export const SCENARIO_PATH = path.join(scenarioDir, 'scenario.json');
writeFileSync(
  SCENARIO_PATH,
  readFileSync(path.join(REPO_ROOT, 'tests', 'scenarios', 'v4.11-tool-harness.json'), 'utf8').replaceAll(
    '{{FIXTURE}}',
    FIXTURE_URL,
  ),
  'utf8',
);
