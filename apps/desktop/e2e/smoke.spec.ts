import { copyFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, _electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Electron 冒烟（TR-35.1）：在 pack:dir 生产构建产物上启动，
 * 验证窗口标题、首页渲染、四模块导航与安全基线
 * （webPreferences 安全开关、仅回环监听、托管令牌强制校验）。
 *
 * Smart App Control 开启时（run-e2e.mjs 注入 WBFM_SAC_BLOCKED=1），
 * 未签名打包 exe 必被系统拦截，降级为官方签名 electron.exe 加载
 * 打包产物 app.asar + WBFM_SERVER_PATH 指向打包内 standalone server，
 * 生产链路（fork server / cipher 桥 / 令牌守卫）验证等价。
 */
const releaseDir = path.join(__dirname, '..', 'release', 'win-unpacked');
const packagedExe = path.join(releaseDir, 'WorkBuddyForMe.exe');
const asarPath = path.join(releaseDir, 'resources', 'app.asar');
const officialElectron = path.join(__dirname, '..', '..', '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const packagedServerPath = path.join(releaseDir, 'resources', 'server', 'apps', 'web', 'server.js');
const useOfficialElectron = process.env.WBFM_SAC_BLOCKED === '1';

/**
 * 复制官方 electron.exe 作为宿主：字节不变（签名与 hash 一致，SAC 放行），
 * 但 exe 名 ≠ electron 使 app.isPackaged === true，从而走完整生产链路
 * （托管 server + cipher 桥 + 令牌注入），与真实打包行为等价。
 */
function ensureElectronHost(): string {
  const hostExe = path.join(releaseDir, 'WbfmElectronHost.exe');
  if (!existsSync(hostExe)) copyFileSync(officialElectron, hostExe);
  return hostExe;
}

let electronApp: ElectronApplication;
let page: Page;

interface WbfmBridge {
  token: string;
  baseUrl: string;
  isManaged: boolean;
}

test.beforeAll(async () => {
  // 数据根与 userData 均重定向到临时目录：
  // 避免污染真实用户数据，也避免残留实例的单实例锁阻塞本次启动
  const dataRoot = mkdtempSync(path.join(tmpdir(), 'wbfm-smoke-data-'));
  const userData = mkdtempSync(path.join(tmpdir(), 'wbfm-smoke-user-'));
  electronApp = await _electron.launch({
    executablePath: useOfficialElectron ? ensureElectronHost() : packagedExe,
    args: useOfficialElectron ? [asarPath] : [],
    timeout: 120_000,
    env: {
      ...process.env,
      WBFM_DATA_ROOT: dataRoot,
      WBFM_USER_DATA_DIR: userData,
      ...(useOfficialElectron ? { WBFM_SERVER_PATH: packagedServerPath } : {}),
    } as Record<string, string>,
  });
  page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await electronApp?.close();
});

test('窗口标题与首页渲染（重定向到 /chat）', async () => {
  await expect(page).toHaveTitle('WorkBuddy For Me', { timeout: 90_000 });
  await expect(page.getByTestId('chat-page')).toBeVisible({ timeout: 90_000 });
});

test('导航覆盖对话/知识库/助手/设置四模块', async () => {
  await page.getByRole('link', { name: /知识库/ }).click();
  await expect(page.getByTestId('kb-sidebar')).toBeVisible();

  await page.getByRole('link', { name: /助手/ }).click();
  await expect(page.getByTestId('assistant-grid')).toBeVisible();

  await page.getByRole('link', { name: /设置/ }).click();
  await expect(page.getByTestId('defaults-panel')).toBeVisible();
  // M3：关于面板渲染版本号与更新通道（updater 桥经 preload 注入）
  await expect(page.getByTestId('about-panel')).toBeVisible();
  await expect(page.getByTestId('about-version')).toContainText('v0.4.0');

  await page.getByRole('link', { name: /^对话/ }).click();
  await expect(page.getByTestId('chat-page')).toBeVisible();
});

test('安全基线：webPreferences 安全开关与仅回环监听', async () => {
  const prefs = await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]!;
    const webPreferences = win.webContents.getLastWebPreferences();
    return {
      contextIsolation: webPreferences?.contextIsolation ?? null,
      nodeIntegration: webPreferences?.nodeIntegration ?? null,
      sandbox: webPreferences?.sandbox ?? null,
      url: win.webContents.getURL(),
    };
  });

  expect(prefs.contextIsolation).toBe(true);
  expect(prefs.nodeIntegration).toBe(false);
  expect(prefs.sandbox).toBe(true);
  expect(prefs.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//);
});

test('托管令牌：无令牌 401 拒绝，携带令牌放行', async () => {
  const bridge = await page.evaluate((): Partial<WbfmBridge> => {
    const wbfm = (window as { wbfm?: WbfmBridge }).wbfm;
    return { token: wbfm?.token, baseUrl: wbfm?.baseUrl, isManaged: wbfm?.isManaged };
  });

  expect(bridge.isManaged).toBe(true);
  expect(bridge.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(bridge.token).toBeTruthy();

  const denied = await fetch(`${bridge.baseUrl}/api/health`);
  expect(denied.status).toBe(401);

  const allowed = await fetch(`${bridge.baseUrl}/api/health`, {
    headers: { 'x-wbfm-token': bridge.token! },
  });
  expect(allowed.status).toBe(200);
  const payload = (await allowed.json()) as { success: boolean; data: { status: string } };
  expect(payload.success).toBe(true);
  expect(payload.data.status).toBe('ok');
});
