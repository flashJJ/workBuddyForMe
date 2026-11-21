import { expect, test } from '@playwright/test';
import { waitForHydrated } from './utils';
import { resetE2eData } from './reset';
import { ensureMockChatModel } from './seed';

/**
 * v4.19 M1：会话级备用模型覆盖优先于助手链。
 * 主模型注入 429 后，应切到会话覆盖的模型，而不是助手配置的第一个备用。
 */

test.beforeAll(async ({ request }) => {
  await resetE2eData(request);
});

test('会话覆盖的备用模型优先于助手链', async ({ page, request }) => {
  const primary = await ensureMockChatModel(request, {
    providerName: 'E2E 覆盖供应商',
    modelName: 'mock-chat',
  });
  const chainFirst = await ensureMockChatModel(request, {
    providerName: 'E2E 覆盖供应商',
    modelName: 'mock-chat-chain',
  });
  const override = await ensureMockChatModel(request, {
    providerName: 'E2E 覆盖供应商',
    modelName: 'mock-chat-override',
  });

  const created = await request.post('/api/assistants', {
    data: {
      name: '覆盖助手',
      modelId: primary.modelId,
      fallbackModelIds: [chainFirst.modelId],
    },
  });
  expect(created.ok(), `创建助手失败：${created.status()}`).toBeTruthy();
  const assistant = ((await created.json()) as { data: { id: string } }).data;

  const conversationResponse = await request.post('/api/conversations', {
    data: { assistantId: assistant.id, title: '覆盖测试' },
  });
  expect(conversationResponse.ok()).toBeTruthy();
  const conversation = ((await conversationResponse.json()) as { data: { id: string } }).data;

  const patched = await request.patch(`/api/conversations/${conversation.id}`, {
    data: { fallbackModelId: override.modelId },
  });
  expect(patched.ok(), `设置会话覆盖失败：${patched.status()}`).toBeTruthy();

  await page.goto(`/chat?conversation=${conversation.id}`);
  await waitForHydrated(page);
  await page.getByLabel('消息输入框').fill('[eval-fail:mock-chat:429] 会话覆盖切换测试');
  await page.getByLabel('消息输入框').press('Enter');

  const notice = page.getByTestId('model-switch-notice').last();
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice).toContainText('mock-chat-override');
  await expect(notice).not.toContainText('mock-chat-chain');
});
