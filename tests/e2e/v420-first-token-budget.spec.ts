import { expect, test } from '@playwright/test';
import { waitForHydrated } from './utils';
import { resetE2eData } from './reset';
import { ensureMockChatModel } from './seed';

/**
 * v4.20 M1：首字预算提示。
 *
 * 预置极低基线（P50=1ms → 阈值 2ms），发送后首字未到即出现非阻断提示；
 * 关闭后本轮不再出现；不自动切换模型。
 */

let conversationId = '';

test.beforeAll(async ({ request }) => {
  await resetE2eData(request);
  await request.put('/api/settings', { data: { hasOnboarded: true } });
  const model = await ensureMockChatModel(request, {
    providerName: 'E2E 首字预算供应商',
    modelName: 'mock-chat',
  });
  const assistant = await request.post('/api/assistants', {
    data: { name: '首字预算助手', modelId: model.modelId },
  });
  expect(assistant.ok()).toBeTruthy();
  const assistantId = ((await assistant.json()) as { data: { id: string } }).data.id;
  const conversation = await request.post('/api/conversations', {
    data: { assistantId, title: '首字预算会话' },
  });
  expect(conversation.ok()).toBeTruthy();
  conversationId = ((await conversation.json()) as { data: { id: string } }).data.id;
});

test('首字超过本机基线时提示一次，可关闭且不自动切换模型', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('wbfm:perf:first-token-samples', JSON.stringify([1, 1, 1]));
  });
  // 人为延迟首字：CI 本机回环可能在一帧内完成，阈值 2ms 来不及触发
  await page.route('**/api/chat/stream', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await route.continue();
  });
  await page.goto(`/chat?conversation=${conversationId}`);
  await waitForHydrated(page);
  await expect(page.getByTestId('composer')).toBeVisible({ timeout: 30_000 });

  await page.getByLabel('消息输入框').fill('你好，简单介绍一下你自己');
  await page.getByLabel('消息输入框').press('Enter');

  const bar = page.getByTestId('first-token-budget-bar');
  await expect(bar).toBeVisible({ timeout: 15_000 });
  await expect(bar).toContainText('首字已等待');

  await page.getByRole('button', { name: '关闭提示' }).click();
  await expect(bar).toBeHidden();

  // 不自动降级：助手切换器仍显示原助手
  await expect(page.getByTestId('assistant-switcher')).toContainText('首字预算助手');
});
