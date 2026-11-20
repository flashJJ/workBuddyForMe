import { expect, test, type APIRequestContext } from '@playwright/test';
import { revealSettingsSection, waitForHydrated } from './utils';

import { resetE2eData } from './reset';

// 文件级隔离：任何 spec 单独/乱序运行都从「刚安装」状态开始（见 reset.ts）
test.beforeAll(async ({ request }) => {
  await resetE2eData(request);
});

/**
 * v4.15 P2：视觉巡检 L1（只覆盖稳定的 2D 界面）。
 *
 * 排除项：WebGL/VRM/Live2D 舞台、透明桌宠窗、会议舞台——这些区域受显卡与动画影响，
 * 截图噪声大于收益，留给人工巡检或后续 L2。
 *
 * 基线只在 Linux/CI 生成并提交；本地默认跳过，需 `WBFM_VISUAL=1` 才运行。
 */

const ENABLED = process.env.WBFM_VISUAL === '1';
const PROVIDER_NAME = 'v415-visual-mock';
const ASSISTANT_NAME = 'v415 视觉巡检助手';
const SHOT = { animations: 'disabled' as const, caret: 'hide' as const, maxDiffPixelRatio: 0.02 };

interface Envelope<T> {
  data: T;
}

test.skip(!ENABLED, '视觉巡检需 WBFM_VISUAL=1（基线在 Linux/CI 生成）');
test.use({ viewport: { width: 1280, height: 800 } });

test.describe.serial('v4.15 视觉巡检 L1', () => {
  let assistantId = '';
  let providerId = '';
  let conversationId = '';

  test.beforeAll(async ({ request }) => {
    await request.put('/api/settings', {
      data: { hasOnboarded: true, language: 'zh-CN', theme: 'light' },
    });
    const seeded = await seedChatModel(request);
    assistantId = seeded.assistantId;
    providerId = seeded.providerId;
    await request.put('/api/settings', { data: { defaultChatModelId: seeded.modelId } });
    conversationId = await seedConversation(request, assistantId);
  });

  test.afterAll(async ({ request }) => {
    if (assistantId) await request.delete(`/api/assistants/${assistantId}`).catch(() => undefined);
    if (providerId) await request.delete(`/api/providers/${providerId}`).catch(() => undefined);
  });

  test('设置页基础区', async ({ page }) => {
    await page.goto('/settings');
    await waitForHydrated(page);
    await revealSettingsSection(page, 'base');
    await expect(page.getByText('基础设置').first()).toBeVisible();
    await expect(page).toHaveScreenshot('settings-base.png', SHOT);
  });

  test('记忆面板', async ({ page }) => {
    await page.goto('/settings');
    await waitForHydrated(page);
    await revealSettingsSection(page, 'data');
    const panel = page.getByTestId('memory-panel');
    await panel.scrollIntoViewIfNeeded();
    await expect(panel).toBeVisible();
    await expect(panel).toHaveScreenshot('memory-panel.png', SHOT);
  });

  test('上下文洞察抽屉', async ({ page }) => {
    await page.goto(`/chat?conversation=${conversationId}`);
    await waitForHydrated(page);
    await page.getByTestId('chat-header-more').click();
    await page.getByTestId('context-insights-open').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // 等查询结束并落到空状态，避免把「加载中」截图当成基线
    await expect(dialog.getByText('还没有上下文记录，先聊一轮再看。')).toBeVisible();
    await expect(dialog).toHaveScreenshot('context-insights.png', SHOT);
  });
});

/** 幂等准备一个可用的对话模型（E2E 数据根每次运行独立） */
async function seedChatModel(
  request: APIRequestContext,
): Promise<{ providerId: string; modelId: string; assistantId: string }> {
  const providerRes = await request.post('/api/providers', {
    data: {
      name: PROVIDER_NAME,
      protocol: 'openai-compatible',
      baseUrl: 'http://mock.local/v1',
      apiKey: 'sk-mock-v415',
    },
  });
  expect(providerRes.ok()).toBeTruthy();
  const provider = ((await providerRes.json()) as Envelope<{ id: string }>).data;

  const modelRes = await request.post(`/api/providers/${provider.id}/models`, {
    data: { modelId: 'mock-chat', capabilities: ['chat'], contextWindow: 128_000 },
  });
  expect(modelRes.ok()).toBeTruthy();
  const model = ((await modelRes.json()) as Envelope<{ id: string }>).data;

  const assistantRes = await request.post('/api/assistants', {
    data: { name: ASSISTANT_NAME, modelId: model.id },
  });
  expect(assistantRes.ok()).toBeTruthy();
  const assistant = ((await assistantRes.json()) as Envelope<{ id: string }>).data;

  return { providerId: provider.id, modelId: model.id, assistantId: assistant.id };
}

async function seedConversation(request: APIRequestContext, assistantId: string): Promise<string> {
  const res = await request.post('/api/conversations', {
    data: { assistantId, title: '视觉巡检会话' },
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as Envelope<{ id: string }>).data.id;
}
