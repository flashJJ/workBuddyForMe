import { copyFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, _electron, type ElectronApplication, type Page } from '@playwright/test';
import { waitForMainWindow } from './helpers/main-window';
import { FIXTURE_URL, SCENARIO_PATH } from './network-fixture';

/**
 * v4.11 P1-3：Electron 生产链路的联网冒烟。
 *
 * 与 Web E2E 同源场景（fetch-concurrent），但跑在打包后的 Electron + 托管 server 上：
 * - 三页并发抓取不逐页弹「工具执行确认」；
 * - 工具时间线 3 次成功，最终回答拿到 3 条工具结果；
 * - Fake Web 请求到达跨度 <150ms，证明桌面端同样并发。
 */
const releaseDir = process.env.WBFM_RELEASE_DIR
  ? path.resolve(__dirname, '..', process.env.WBFM_RELEASE_DIR)
  : path.join(__dirname, '..', 'release', 'win-unpacked');
const packagedExe = path.join(releaseDir, 'WorkBuddyForMe.exe');
const asarPath = path.join(releaseDir, 'resources', 'app.asar');
const officialElectron = path.join(__dirname, '..', '..', '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const packagedServerPath = path.join(releaseDir, 'resources', 'server', 'apps', 'web', 'server.js');
const useOfficialElectron = process.env.WBFM_SAC_BLOCKED === '1';

interface WbfmBridge {
  token: string;
  baseUrl: string;
  isManaged: boolean;
}

let electronApp: ElectronApplication;
let page: Page;
let bridge: WbfmBridge;

/** 与 smoke.spec 相同的 SAC 降级宿主：官方签名 exe 加载 app.asar */
function ensureElectronHost(): string {
  const hostExe = path.join(releaseDir, 'WbfmElectronHost.exe');
  if (!existsSync(hostExe)) copyFileSync(officialElectron, hostExe);
  return hostExe;
}

async function api<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  route: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${bridge.baseUrl}${route}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-wbfm-token': bridge.token },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = (await response.json()) as {
    success: boolean;
    data: T;
    error?: { message?: string };
  };
  if (!response.ok || !payload.success) {
    throw new Error(`${method} ${route} 失败：HTTP ${response.status} ${payload.error?.message ?? ''}`);
  }
  return payload.data;
}

test.beforeAll(async () => {
  const dataRoot = mkdtempSync(path.join(tmpdir(), 'wbfm-net-data-'));
  const userData = mkdtempSync(path.join(tmpdir(), 'wbfm-net-user-'));
  electronApp = await _electron.launch({
    executablePath: useOfficialElectron ? ensureElectronHost() : packagedExe,
    args: useOfficialElectron ? [asarPath] : [],
    timeout: 120_000,
    env: {
      ...process.env,
      WBFM_DATA_ROOT: dataRoot,
      WBFM_USER_DATA_DIR: userData,
      // v4.11：场景化 mock 与回环抓取放行只作用于本次 Electron 冒烟
      WBFM_MOCK_AI: '1',
      WBFM_MOCK_SCENARIO: SCENARIO_PATH,
      WBFM_FETCH_ALLOW_PRIVATE: '1',
      ...(useOfficialElectron ? { WBFM_SERVER_PATH: packagedServerPath } : {}),
    } as Record<string, string>,
  });
  page = await waitForMainWindow(electronApp);
  await page.waitForLoadState('domcontentloaded');

  const onboardingSkip = page.getByRole('button', { name: /跳过|Skip/ });
  await expect(onboardingSkip).toBeVisible({ timeout: 30_000 });
  await onboardingSkip.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  bridge = await page.evaluate((): WbfmBridge => {
    const wbfm = (window as { wbfm?: WbfmBridge }).wbfm;
    return { token: wbfm?.token ?? '', baseUrl: wbfm?.baseUrl ?? '', isManaged: Boolean(wbfm?.isManaged) };
  });
  expect(bridge.isManaged).toBe(true);
  expect(bridge.token).toBeTruthy();
});

test.afterAll(async () => {
  await electronApp?.close();
});

test('桌面端联网检索：三页并发抓取零确认，工具全部成功', async () => {
  const provider = await api<{ id: string }>('POST', '/api/providers', {
    name: 'v411-e2e-desktop-mock',
    protocol: 'openai-compatible',
    baseUrl: 'http://mock.local/v1',
    apiKey: 'sk-mock-desktop',
  });
  const model = await api<{ id: string }>('POST', `/api/providers/${provider.id}/models`, {
    modelId: 'mock-chat',
    capabilities: ['chat'],
    contextWindow: 128_000,
  });
  const assistant = await api<{ id: string }>('POST', '/api/assistants', {
    name: 'v411 桌面联网助手',
    modelId: model.id,
    enabledTools: ['fetch_webpage'],
  });
  expect(assistant.id).toBeTruthy();

  // 重新加载让助手列表包含刚创建的记录
  await page.reload();
  await page.waitForSelector('html[data-hydrated="1"]', { timeout: 30_000 });
  await page.getByRole('link', { name: '对话', exact: true }).click();
  await page.getByLabel('切换助手').click();
  await page.getByRole('option', { name: /v411 桌面联网助手/ }).first().click();

  await fetch(`${FIXTURE_URL}/__reset`, { method: 'POST' });

  const confirm = page.getByRole('dialog', { name: '工具执行确认' });
  const reply = page.getByText(/抓取完成。观测：/);
  await page.getByLabel('消息输入框').fill('[scenario:fetch-concurrent] 请并发抓取三个页面');
  await page.getByLabel('消息输入框').press('Enter');

  await expect(reply.or(confirm).first()).toBeVisible({ timeout: 30_000 });
  await expect(confirm).toHaveCount(0);
  await expect(reply).toBeVisible();
  await expect(reply).toContainText('"count":3');

  const trace = page.getByTestId('tool-trace').last();
  await expect(trace.getByTestId('tool-trace-toggle')).toContainText('工具调用 · 3 次');
  if ((await trace.getAttribute('data-open')) !== 'true') {
    await trace.getByTestId('tool-trace-toggle').click();
  }
  const rows = trace.getByTestId('tool-trace-row');
  await expect(rows).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await expect(rows.nth(index)).toHaveAttribute('data-tool', 'fetch_webpage');
    await expect(rows.nth(index)).toHaveAttribute('data-status', 'ok');
  }

  const stats = (await (await fetch(`${FIXTURE_URL}/__stats`)).json()) as {
    requests: Array<{ path: string; at: number }>;
  };
  const slow = stats.requests.filter((item) => item.path === '/slow');
  expect(slow).toHaveLength(3);
  const spread = Math.max(...slow.map((item) => item.at)) - Math.min(...slow.map((item) => item.at));
  expect(spread).toBeLessThan(150);

  await api('DELETE', `/api/assistants/${assistant.id}`);
  await api('DELETE', `/api/providers/${provider.id}`);
});
