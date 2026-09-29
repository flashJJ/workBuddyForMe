import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test, _electron, type ElectronApplication } from '@playwright/test';

const execFileAsync = promisify(execFile);

/**
 * v0.7 M2 键鼠执行冒烟：在 pack:dir 生产构建产物上验证
 * nut-js 原生依赖归集（asarUnpack）与键鼠通道端到端可用。
 * 用「移动鼠标 → 读回位置」闭环断言，不依赖任何第三方窗口。
 *
 * SAC 开启时同 smoke.spec.ts：官方签名 electron.exe 宿主 + app.asar。
 */
const releaseDir = process.env.WBFM_RELEASE_DIR
  ? path.resolve(__dirname, '..', process.env.WBFM_RELEASE_DIR)
  : path.join(__dirname, '..', 'release', 'win-unpacked');
const packagedExe = path.join(releaseDir, 'WorkBuddyForMe.exe');
const asarPath = path.join(releaseDir, 'resources', 'app.asar');
const officialElectron = path.join(__dirname, '..', '..', '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const packagedServerPath = path.join(releaseDir, 'resources', 'server', 'apps', 'web', 'server.js');
const useOfficialElectron = process.env.WBFM_SAC_BLOCKED === '1';

function ensureElectronHost(): string {
  const hostExe = path.join(releaseDir, 'WbfmElectronHost.exe');
  if (!existsSync(hostExe)) copyFileSync(officialElectron, hostExe);
  return hostExe;
}

let electronApp: ElectronApplication;
let dataRoot = '';

async function postChannel(
  info: { url: string; token: string },
  route: string,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${info.url}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${info.token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

test.beforeAll(async () => {
  const dataRootDir = mkdtempSync(path.join(tmpdir(), 'wbfm-m2-data-'));
  dataRoot = dataRootDir;
  const userData = mkdtempSync(path.join(tmpdir(), 'wbfm-m2-user-'));
  electronApp = await _electron.launch({
    executablePath: useOfficialElectron ? ensureElectronHost() : packagedExe,
    args: useOfficialElectron ? [asarPath] : [],
    timeout: 120_000,
    env: {
      ...process.env,
      WBFM_DATA_ROOT: dataRootDir,
      WBFM_USER_DATA_DIR: userData,
      ...(useOfficialElectron ? { WBFM_SERVER_PATH: packagedServerPath } : {}),
    } as Record<string, string>,
  });
  await electronApp.firstWindow();
});

test.afterAll(async () => {
  await electronApp?.close();
});

test('键鼠通道：移动鼠标并读回位置（nut-js 原生依赖打包验证）', async () => {
  const channelFile = path.join(dataRoot, 'computer-channel.json');
  await expect.poll(() => existsSync(channelFile), { timeout: 15_000 }).toBe(true);
  const info = JSON.parse(readFileSync(channelFile, 'utf8')) as { url: string; token: string };

  // 读当前位置
  const before = await postChannel(info, '/input/mouse-position', {});
  expect(before.status).toBe(200);
  const beforePos = before.json as { x: number; y: number };

  // 移动到一个确定位置（屏幕左上角安全区），再读回
  const target = { x: 120, y: 120 };
  const moved = await postChannel(info, '/input/mouse-move', target);
  expect(moved.status).toBe(200);
  const after = await postChannel(info, '/input/mouse-position', {});
  const afterPos = after.json as { x: number; y: number };
  // 允许 ±2px 误差（DPI 取整）
  expect(Math.abs(afterPos.x - target.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(afterPos.y - target.y)).toBeLessThanOrEqual(2);

  // 键鼠路由参数校验：缺 y 应 422；未知路由 404
  expect((await postChannel(info, '/input/mouse-move', { x: 1 })).status).toBe(422);
  expect((await postChannel(info, '/input/nope', {})).status).toBe(404);

  // 恢复鼠标位置，避免干扰后续测试
  await postChannel(info, '/input/mouse-move', { x: beforePos.x, y: beforePos.y });
});

test('记事本链路：UIA 定位 + 键盘输入 + Ctrl+S 保存落盘（M2 验收）', async () => {
  test.setTimeout(90_000);
  const channelFile = path.join(dataRoot, 'computer-channel.json');
  await expect.poll(() => existsSync(channelFile), { timeout: 15_000 }).toBe(true);
  const info = JSON.parse(readFileSync(channelFile, 'utf8')) as { url: string; token: string };

  // 预建空文件：记事本直接绑定路径打开，Ctrl+S 免保存对话框
  const workDir = mkdtempSync(path.join(tmpdir(), 'wbfm-m2-notepad-'));
  const filePath = path.join(workDir, 'wbfm-m2-e2e.txt');
  writeFileSync(filePath, '', 'utf8');
  const titleKey = 'wbfm-m2-e2e';

  try {
    // 1) 启动记事本并打开目标文件
    const launched = await postChannel(info, '/app/launch', { target: 'notepad.exe', args: [filePath] });
    expect(launched.status).toBe(200);

    // 2) 窗口列表轮询直到记事本窗口出现（标题含文件名，跨语言稳定）
    let notepadWin: { handle: string; title: string } | null = null;
    await expect
      .poll(
        async () => {
          const res = await postChannel(info, '/windows/list', {});
          const wins = (res.json as { windows: Array<{ handle: string; title: string }> }).windows;
          notepadWin = wins.find((w) => w.title.includes(titleKey)) ?? null;
          return notepadWin !== null;
        },
        { timeout: 20_000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);

    // 3) UIA 控件树：定位编辑控件（Edit/Document），验证控件级定位可用
    const uia = await postChannel(info, '/uia/list', { windowTitle: titleKey, maxNodes: 300 });
    expect(uia.status).toBe(200);
    const uiaData = uia.json as {
      windowTitle: string;
      elements: Array<{ controlType: string; rect: { width: number; height: number } }>;
    };
    expect(uiaData.windowTitle).toContain(titleKey);
    const editor = uiaData.elements.find(
      (el) => (el.controlType === 'Edit' || el.controlType === 'Document') && el.rect.width > 50,
    );
    expect(editor, 'UIA 树中应存在编辑控件').toBeTruthy();

    // 4) 聚焦窗口 → 键盘输入 ASCII 文本 → Ctrl+S 保存
    const focused = await postChannel(info, '/windows/focus', { handle: notepadWin!.handle });
    expect(focused.status).toBe(200);
    expect((await postChannel(info, '/input/keyboard-type', { text: 'WBFM-M2-UIA' })).status).toBe(200);
    expect((await postChannel(info, '/input/keyboard-press', { keys: ['control', 's'] })).status).toBe(200);

    // 5) 轮询文件内容落盘
    await expect
      .poll(() => readFileSync(filePath, 'utf8'), { timeout: 15_000, intervals: [500, 1000, 2000] })
      .toContain('WBFM-M2-UIA');
  } finally {
    // 只按标题精确前缀清理本测试拉起的记事本，避免误关用户窗口
    await execFileAsync('taskkill', ['/FI', `WINDOWTITLE eq ${titleKey}*`, '/T', '/F']).catch(() => {});
  }
});
