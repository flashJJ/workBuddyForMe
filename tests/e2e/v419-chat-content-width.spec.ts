import { expect, test } from '@playwright/test';
import { chooseOption, waitForHydrated } from './utils';
import { resetE2eData } from './reset';
import { ensureMockChatModel } from './seed';

/**
 * v4.19 M6：对话正文列随视口扩展。
 *
 * 之前消息区与输入区固定 768px 居中，大屏两侧留白过多；
 * 现在使用 clamp(48rem, 70vw, 72rem)，在 1440 视口下应明显宽于 1024。
 */

test.beforeAll(async ({ request }) => {
  await resetE2eData(request);
});

test('对话正文列随视口变宽，不再固定挤在中间', async ({ page, request }) => {
  await request.put('/api/settings', { data: { hasOnboarded: true } });
  const model = await ensureMockChatModel(request, {
    providerName: 'E2E 宽度供应商',
    modelName: 'mock-chat',
  });
  const assistant = await request.post('/api/assistants', {
    data: { name: '宽度助手', modelId: model.modelId },
  });
  expect(assistant.ok(), `创建助手失败：${assistant.status()}`).toBeTruthy();

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/chat');
  await waitForHydrated(page);
  await page.waitForLoadState('networkidle');
  // 列表中可能还有向导创建的默认助手，显式切到带 mock 模型的助手
  await chooseOption(page, page.getByLabel('切换助手'), /宽度助手/);

  const emptyState = page.getByTestId('chat-empty-state');
  await expect(emptyState).toBeVisible({ timeout: 15_000 });
  const narrow = await emptyState.boundingBox();
  if (!narrow) throw new Error('缺少空态布局盒');

  await page.setViewportSize({ width: 1440, height: 900 });
  const wide = await emptyState.boundingBox();
  if (!wide) throw new Error('缺少宽屏空态布局盒');

  expect(wide.width, '1440 下正文列应明显宽于 1024').toBeGreaterThan(narrow.width + 120);
  expect(wide.width, '正文列仍需有可读性上限').toBeLessThanOrEqual(1152);

  await page.screenshot({ path: 'test-results/responsive-v419/chat-width-1440.png' });
});
