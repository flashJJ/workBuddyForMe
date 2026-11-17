import { copyFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, _electron, type ElectronApplication } from '@playwright/test';
import { hasSplashWindow, waitForMainWindow, waitForSplashWindow } from './helpers/main-window';

/**
 * v4.5 启动画面：首个窗口是 splash，主窗就绪后交接；点击跳过不阻塞主窗。
 * 与 smoke 相同的 pack:dir 产物与 Smart App Control 降级约定。
 */
const releaseDir = process.env.WBFM_RELEASE_DIR
  ? path.resolve(__dirname, '..', process.env.WBFM_RELEASE_DIR)
  : path.join(__dirname, '..', 'release', 'win-unpacked');
const packagedExe = path.join(releaseDir, 'WorkBuddyForMe.exe');
const officialElectron = path.join(__dirname, '..', '..', '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const packagedServerPath = path.join(releaseDir, 'resources', 'server', 'apps', 'web', 'server.js');
const useOfficialElectron = process.env.WBFM_SAC_BLOCKED === '1';

function ensureElectronHost(): string {
  const hostExe = path.join(releaseDir, 'WbfmElectronHost.exe');
  if (!existsSync(hostExe)) copyFileSync(officialElectron, hostExe);
  return hostExe;
}

let electronApp: ElectronApplication;

test.afterAll(async () => {
  await electronApp?.close();
});

test('启动画面出现、可跳过，主窗出现后 splash 关闭', async () => {
  test.setTimeout(180_000);
  const dataRoot = mkdtempSync(path.join(tmpdir(), 'wbfm-splash-data-'));
  const userData = mkdtempSync(path.join(tmpdir(), 'wbfm-splash-user-'));
  electronApp = await _electron.launch({
    executablePath: useOfficialElectron ? ensureElectronHost() : packagedExe,
    args: useOfficialElectron ? [path.join(releaseDir, 'resources', 'app.asar')] : [],
    timeout: 120_000,
    env: {
      ...process.env,
      WBFM_DATA_ROOT: dataRoot,
      WBFM_USER_DATA_DIR: userData,
      // e2e：让 Playwright 先 attach，否则可能在首个窗口创建之后才连上
      WBFM_SPLASH_DELAY_MS: '800',
      ...(useOfficialElectron ? { WBFM_SERVER_PATH: packagedServerPath } : {}),
    } as Record<string, string>,
  });

  const splash = await waitForSplashWindow(electronApp);
  await expect(splash).toHaveTitle(/启动中|Starting/);

  const skip = splash.getByRole('button', { name: /跳过|Skip/ });
  await expect(skip).toBeVisible({ timeout: 15_000 });
  await skip.click();

  const main = await waitForMainWindow(electronApp);
  await expect(main).toHaveTitle('WorkBuddyForMe', { timeout: 90_000 });
  await expect.poll(() => hasSplashWindow(electronApp), { timeout: 15_000 }).toBe(false);
});
