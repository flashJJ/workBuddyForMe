import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { waitForHydrated } from './utils';

/**
 * v2.0 M3 主动感知 2.0 e2e：
 * - 系统事件授权：默认关、显式开启、重载持久化、剧情总开关关时分组隐藏（三态回归）；
 * - 3 个上下文关怀剧本（ev.context.*）随内置注册表渲染且可单条停用；
 * - 原始信号不落盘：chat 页 tick 写 localStorage 的内容仅为边沿去重状态
 *   （workStreak/lateNight/longNoChat 三键），无任何 unlock/lock/idle 信号流水。
 * 触发时机/阈值/勿扰/频率档全部为 shared 纯函数与 EventDirector 单测覆盖，本规格只锁生命周期。
 */

const ASSISTANT_NAME = '感知测试助手';
const PROVIDER_NAME = 'v20-awareness-e2e-mock';

async function skipOnboardingIfShown(page: Page): Promise<void> {
  const wizard = page.getByRole('dialog', { name: '首次使用向导' });
  try {
    await wizard.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    return;
  }
  await page.getByRole('button', { name: '跳过' }).click();
  await expect(wizard).toBeHidden();
}

async function gotoSettings(page: Page): Promise<void> {
  await page.goto('/settings');
  await waitForHydrated(page);
  await skipOnboardingIfShown(page);
  await expect(page.getByTestId('event-panel')).toBeVisible();
}

/** mock-chat 模型（WBFM_MOCK_AI 下幂等）+ 专属助手，返回助手 id */
async function seedAssistant(request: APIRequestContext): Promise<string> {
  const providers = (await request.get('/api/providers').then((r) => r.json())).data as Array<{
    id: string;
    name: string;
  }>;
  let provider = providers.find((p) => p.name === PROVIDER_NAME);
  if (!provider) {
    const res = await request.post('/api/providers', {
      data: {
        name: PROVIDER_NAME,
        protocol: 'openai-compatible',
        baseUrl: 'http://mock.local/v1',
        apiKey: 'sk-mock-awareness',
      },
    });
    expect(res.ok()).toBeTruthy();
    provider = (await res.json()).data as { id: string; name: string };
  }
  const providerId = provider.id;
  const models = (await (
    await request.get(`/api/providers/${providerId}/models`)
  ).json()).data as Array<{ id: string; modelId: string }>;
  let model = models.find((m) => m.modelId === 'mock-chat');
  if (!model) {
    const res = await request.post(`/api/providers/${providerId}/models`, {
      data: { modelId: 'mock-chat', capabilities: ['chat'] },
    });
    expect(res.ok()).toBeTruthy();
    model = (await res.json()).data as { id: string; modelId: string };
  }
  const modelId = model.id;
  const res = await request.post('/api/assistants', {
    data: { name: ASSISTANT_NAME, modelId },
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { data: { id: string } }).data.id;
}

test.describe.serial('v2.0 M3 主动感知：系统事件授权与上下文剧本', () => {
  let assistantId = '';

  test.beforeAll(async ({ request }) => {
    await request.put('/api/settings', { data: { hasOnboarded: true } });
    assistantId = await seedAssistant(request);
  });

  test.afterAll(async ({ request }) => {
    await request.put('/api/settings', {
      data: { systemEventAwarenessEnabled: false, eventsEnabled: true },
    });
    if (assistantId) await request.delete(`/api/assistants/${assistantId}`);
    // 本规格字母序早于 critical-path：供应商必须删净，否则其 model-id 输入框严格选择器命中 2 个
    const providers = (await request.get('/api/providers').then((r) => r.json())).data as Array<{
      id: string;
      name: string;
    }>;
    const mine = providers.find((p) => p.name === PROVIDER_NAME);
    if (mine) await request.delete(`/api/providers/${mine.id}`);
  });

  test('授权默认关；3 个上下文剧本在列表中且可停用', async ({ page }) => {
    await gotoSettings(page);
    await expect(page.getByTestId('awareness-enabled-toggle')).not.toBeChecked();
    for (const id of ['ev.context.latenight', 'ev.context.workstreak', 'ev.context.longnochat']) {
      await expect(page.getByTestId(`event-scene-toggle-${id}`)).toBeChecked();
    }

    // 单条停用上下文剧本（写入 disabledEventIds）
    const workstreak = page.getByTestId('event-scene-toggle-ev.context.workstreak');
    await workstreak.uncheck();
    await expect(workstreak).not.toBeChecked();
    // 重新勾上，避免污染后续规格
    await workstreak.check();
    await expect(workstreak).toBeChecked();
  });

  test('显式授权后重载持久化为开；纯浏览器无桌面桥不报错', async ({ page }) => {
    await gotoSettings(page);
    await page.getByTestId('awareness-enabled-toggle').check();
    // 真实落库：GET 回读授权位
    await expect
      .poll(
        async () =>
          ((await page.request.get('/api/settings')).json() as Promise<{
            data: { systemEventAwarenessEnabled?: boolean };
          }>).then((j) => j.data.systemEventAwarenessEnabled === true),
        { timeout: 10_000, intervals: [1_000] },
      )
      .toBeTruthy();

    await page.reload();
    await waitForHydrated(page);
    await expect(page.getByTestId('awareness-enabled-toggle')).toBeChecked();
  });

  test('三态：剧情总开关关闭时授权分组与剧本列表一并隐藏', async ({ page }) => {
    await gotoSettings(page);
    await expect(page.getByTestId('awareness-permission-section')).toBeVisible();
    await page.getByTestId('event-enabled-toggle').uncheck();
    await expect(page.getByTestId('awareness-permission-section')).toHaveCount(0);
    await expect(page.getByTestId(/^event-scene-toggle-/)).toHaveCount(0);
    // 恢复总开关（授权位保持开启，互不串改）
    await page.getByTestId('event-enabled-toggle').check();
    await expect(page.getByTestId('awareness-permission-section')).toBeVisible();
    await expect(page.getByTestId('awareness-enabled-toggle')).toBeChecked();
  });

  test('原始信号不落盘：tick 仅写边沿去重状态（无 unlock/lock/idle 流水）', async ({ page }) => {
    await page.goto('/chat');
    await waitForHydrated(page);
    await page.getByLabel('切换助手').selectOption({ label: ASSISTANT_NAME });

    // 首个 60s tick 后落边沿状态（evaluate 与开关无关，始终归约）
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const raw = window.localStorage.getItem('wbfm.context-awareness.v1');
            return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
          }),
        { timeout: 90_000, intervals: [2_000] },
      )
      .not.toBeNull();

    const raw = await page.evaluate(() =>
      window.localStorage.getItem('wbfm.context-awareness.v1'),
    );
    expect(raw).toBeTruthy();
    const state = JSON.parse(raw!) as Record<string, unknown>;
    // 仅三个派生边沿键；值为 null（全新库无持续工作段）
    expect(Object.keys(state).sort()).toEqual(['lateNight', 'longNoChat', 'workStreak']);
    expect(state.workStreak).toBeNull();
    expect(state.lateNight).toBeNull();
    expect(state.longNoChat).toBeNull();
    // 原始系统信号词不得出现在持久化内容中
    expect(raw).not.toMatch(/unlock|lock-screen|suspend|idleSeconds/);
  });
});
