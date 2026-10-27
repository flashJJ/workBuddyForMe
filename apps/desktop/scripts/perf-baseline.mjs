// v2.6 M5 P1-3：桌面性能基线（启动 → 首窗 → 首页可交互 → 空闲内存）
// 依赖已存在的 pack:dir 产物；不重新打包。
// 用法：
//   pnpm --filter @wbfm/desktop pack:dir
//   pnpm --filter @wbfm/desktop perf:baseline
// 可选：WBFM_RELEASE_DIR=release/win-unpacked  WBFM_PERF_IDLE_SECONDS=15
import { copyFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { _electron } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const releaseDir = process.env.WBFM_RELEASE_DIR
  ? path.resolve(desktopDir, process.env.WBFM_RELEASE_DIR)
  : path.join(desktopDir, 'release', 'win-unpacked');
const packagedExe = path.join(releaseDir, 'WorkBuddyForMe.exe');
const asarPath = path.join(releaseDir, 'resources', 'app.asar');
const packagedServerPath = path.join(releaseDir, 'resources', 'server', 'apps', 'web', 'server.js');
const officialElectron = path.join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
const idleSeconds = Number(process.env.WBFM_PERF_IDLE_SECONDS ?? 15);

function detectSmartAppControl() {
  if (process.platform !== 'win32') return false;
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-MpComputerStatus).SmartAppControlState"',
      { encoding: 'utf8' },
    ).trim();
    return out === 'On';
  } catch {
    return false;
  }
}

if (!existsSync(packagedExe) || !existsSync(asarPath)) {
  console.error(`未找到打包产物：${releaseDir}\n请先运行 pnpm --filter @wbfm/desktop pack:dir`);
  process.exit(1);
}

const useOfficial = process.env.WBFM_SAC_BLOCKED === '1' || detectSmartAppControl();
function electronHost() {
  const host = path.join(releaseDir, 'WbfmElectronHost.exe');
  if (!existsSync(host)) copyFileSync(officialElectron, host);
  return host;
}

const dataRoot = mkdtempSync(path.join(tmpdir(), 'wbfm-perf-data-'));
const userData = mkdtempSync(path.join(tmpdir(), 'wbfm-perf-user-'));
const t0 = performance.now();
const app = await _electron.launch({
  executablePath: useOfficial ? electronHost() : packagedExe,
  args: useOfficial ? [asarPath] : [],
  timeout: 120_000,
  env: {
    ...process.env,
    WBFM_DATA_ROOT: dataRoot,
    WBFM_USER_DATA_DIR: userData,
    ...(useOfficial ? { WBFM_SERVER_PATH: packagedServerPath } : {}),
  },
});
const launchMs = performance.now() - t0;
const page = await app.firstWindow();
const windowMs = performance.now() - t0;
await page.waitForLoadState('domcontentloaded');
const domContentLoadedMs = performance.now() - t0;

let chatVisibleMs = null;
try {
  const skip = page.getByRole('button', { name: /跳过|Skip/ });
  if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await skip.click();
  }
  await page.getByTestId('chat-page').waitFor({ state: 'visible', timeout: 90_000 });
  chatVisibleMs = performance.now() - t0;
} catch {
  chatVisibleMs = null;
}

async function memorySnapshot() {
  const metrics = await app.evaluate(({ app }) =>
    app.getAppMetrics().map((metric) => ({
      pid: metric.pid,
      type: metric.type,
      workingSetSizeKb: metric.memory?.workingSetSize ?? 0,
      peakWorkingSetSizeKb: metric.memory?.peakWorkingSetSize ?? 0,
    })),
  );
  const workingSetMb = metrics.reduce((sum, item) => sum + item.workingSetSizeKb, 0) / 1024;
  const peakWorkingSetMb = metrics.reduce((sum, item) => sum + item.peakWorkingSetSizeKb, 0) / 1024;
  return { workingSetMb: Math.round(workingSetMb), peakWorkingSetMb: Math.round(peakWorkingSetMb), processes: metrics };
}

const early = await memorySnapshot();
await page.waitForTimeout(Math.max(5, idleSeconds) * 1000);
const late = await memorySnapshot();

const result = {
  measuredAt: new Date().toISOString(),
  mode: useOfficial ? `official-electron + app.asar (${path.basename(releaseDir)})` : 'packaged exe',
  idleSeconds,
  timings: {
    launchMs: Math.round(launchMs),
    firstWindowMs: Math.round(windowMs),
    domContentLoadedMs: Math.round(domContentLoadedMs),
    chatVisibleMs: chatVisibleMs === null ? null : Math.round(chatVisibleMs),
  },
  memory: {
    earlyWorkingSetMb: early.workingSetMb,
    lateWorkingSetMb: late.workingSetMb,
    peakWorkingSetMb: late.peakWorkingSetMb,
    deltaMb: late.workingSetMb - early.workingSetMb,
    processes: late.processes.length,
  },
};

console.log(JSON.stringify(result, null, 2));
await app.close();
