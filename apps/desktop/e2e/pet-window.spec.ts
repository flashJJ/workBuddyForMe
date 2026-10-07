import { copyFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, _electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * M4 伴身桌宠窗 E2E（pack:dir 生产构建产物上启动，与 smoke 同套降级约定）：
 * - IPC 开窗：窗口数 2→pet 窗可见/置顶/不可缩放，URL 为 /pet?model=haru；
 * - /pet 瘦终端实际挂载 pet-stage（Live2D chunk 在 Electron 内加载，无 error 条）；
 * - 主窗中继事件仅 pet 窗收到，非法载荷被净化丢弃；字幕渲染；
 * - 关窗后窗口数回落；位置持久化到 pet-state.json，重开恢复。
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
let mainPage: Page;
let petPage: Page;
let userData: string;

interface WbfmPetApi {
  open(modelId?: string): Promise<boolean>;
  close(): Promise<void>;
  isOpen(): Promise<boolean>;
  reportHover(hovering: boolean): void;
  focusMain(): void;
  dragBegin(): void;
  dragTo(): void;
  dragEnd(): void;
  showMenu(): void;
  relayPerformance(event: unknown): void;
  onPerformance(cb: (event: unknown) => void): () => void;
}

declare global {
  interface Window {
    wbfm?: { pet?: WbfmPetApi };
    __petEvents?: Array<Record<string, unknown>>;
  }
}

test.beforeAll(async () => {
  const dataRootDir = mkdtempSync(path.join(tmpdir(), 'wbfm-pet-data-'));
  userData = mkdtempSync(path.join(tmpdir(), 'wbfm-pet-user-'));
  electronApp = await _electron.launch({
    executablePath: useOfficialElectron ? ensureElectronHost() : packagedExe,
    args: useOfficialElectron
      ? [path.join(releaseDir, 'resources', 'app.asar')]
      : [],
    timeout: 120_000,
    env: {
      ...process.env,
      WBFM_DATA_ROOT: dataRootDir,
      WBFM_USER_DATA_DIR: userData,
      ...(useOfficialElectron ? { WBFM_SERVER_PATH: packagedServerPath } : {}),
    } as Record<string, string>,
  });
  mainPage = await electronApp.firstWindow();
  await mainPage.waitForLoadState('domcontentloaded');
  await expect(mainPage).toHaveTitle('WorkBuddy For Me', { timeout: 90_000 });
});

test.afterAll(async () => {
  await electronApp?.close();
});

test.describe.serial('M4 桌宠窗', () => {
  test('① IPC 开窗：pet 窗置顶/固定尺寸、URL 含模型、pet-stage 实际挂载', async () => {
    const windowReady = electronApp.waitForEvent('window');
    const opened = await mainPage.evaluate(async () => await window.wbfm!.pet!.open('haru'));
    expect(opened).toBe(true);
    petPage = await windowReady;
    await petPage.waitForLoadState('domcontentloaded');

    const windows = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => ({
        url: w.webContents.getURL(),
        visible: w.isVisible(),
        alwaysOnTop: w.isAlwaysOnTop(),
        resizable: w.isResizable(),
      })),
    );
    expect(windows).toHaveLength(2);
    const pet = windows.find((w) => w.url.includes('/pet'))!;
    expect(pet.url).toMatch(/\/pet\?model=haru$/);
    expect(pet.visible).toBe(true);
    expect(pet.alwaysOnTop).toBe(true);
    expect(pet.resizable).toBe(false);

    // /pet 瘦终端：Live2D 舞台渲染且无错误条（WebGL 实际初始化）
    await expect(petPage.getByTestId('pet-stage')).toBeVisible({ timeout: 60_000 });
    await expect(petPage.getByTestId('live2d-error')).toHaveCount(0);
    await expect(petPage.locator('canvas')).toHaveCount(1, { timeout: 30_000 });
  });

  test('② 表现事件仅桌宠收到；非法载荷丢弃；字幕渲染', async () => {
    await petPage.evaluate(() => {
      window.__petEvents = [];
      window.wbfm!.pet!.onPerformance((event) => {
        window.__petEvents!.push(event as Record<string, unknown>);
      });
    });

    await mainPage.evaluate(() =>
      window.wbfm!.pet!.relayPerformance({ kind: 'state', state: 'speaking' }),
    );
    await mainPage.evaluate(() =>
      window.wbfm!.pet!.relayPerformance({ kind: 'subtitle', text: '桌宠中继测试' }),
    );
    await mainPage.evaluate(() => window.wbfm!.pet!.relayPerformance({ kind: 'evil' }));

    await expect
      .poll(async () => await petPage.evaluate(() => window.__petEvents?.length ?? 0), {
        timeout: 10_000,
      })
      .toBe(2);
    const events = await petPage.evaluate(() => window.__petEvents ?? []);
    expect(events).toContainEqual({ kind: 'state', state: 'speaking' });
    expect(events).toContainEqual({ kind: 'subtitle', text: '桌宠中继测试' });

    await expect(petPage.getByTestId('pet-subtitle')).toContainText('桌宠中继测试');
  });

  test('③ 悬停上报与双击回主窗 IPC 不报错（实际翻转由滞回单测保证）', async () => {
    // evaluate 内 IPC 抛错会导致 Promise reject 使本用例失败
    await petPage.evaluate(() => window.wbfm!.pet!.reportHover(true));
    await petPage.evaluate(() => window.wbfm!.pet!.reportHover(false));
    await petPage.evaluate(() => window.wbfm!.pet!.focusMain());
    const isOpen = await mainPage.evaluate(async () => await window.wbfm!.pet!.isOpen());
    expect(isOpen).toBe(true);
  });

  test('④ 关窗后窗口数回落；位置持久化且重开恢复', async () => {
    // 先移动到确定位置（再关，close 路径负责落盘）
    await electronApp.evaluate(({ BrowserWindow }) => {
      const pet = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes('/pet'),
      );
      pet?.setBounds({ x: 211, y: 222, width: 260, height: 340 });
    });

    await mainPage.evaluate(async () => await window.wbfm!.pet!.close());
    await expect
      .poll(
        async () =>
          (await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) ===
          1,
        { timeout: 10_000 },
      )
      .toBeTruthy();

    const stateFile = path.join(userData, 'pet-state.json');
    await expect.poll(() => existsSync(stateFile), { timeout: 5_000 }).toBe(true);
    const saved = JSON.parse(readFileSync(stateFile, 'utf8')) as { x: number; y: number };
    // setBounds 在系统缩放（125%/150%）下 DIP↔物理像素有 ±2 取整
    expect(Math.abs(saved.x - 211)).toBeLessThanOrEqual(2);
    expect(Math.abs(saved.y - 222)).toBeLessThanOrEqual(2);

    // 重开：记忆坐标恢复
    const secondReady = electronApp.waitForEvent('window');
    await mainPage.evaluate(async () => await window.wbfm!.pet!.open('hiyori'));
    petPage = await secondReady;
    await expect(petPage.getByTestId('pet-stage')).toBeVisible({ timeout: 60_000 });
    const bounds = await electronApp.evaluate(({ BrowserWindow }) => {
      const pet = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes('/pet'),
      )!;
      return pet.getBounds();
    });
    expect(Math.abs(bounds.x - 211)).toBeLessThanOrEqual(2);
    expect(Math.abs(bounds.y - 222)).toBeLessThanOrEqual(2);
    expect(petPage.url()).toMatch(/\/pet\?model=hiyori$/);
  });
});
