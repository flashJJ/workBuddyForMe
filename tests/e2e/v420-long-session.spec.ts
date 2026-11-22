import { expect, test } from '@playwright/test';
import { waitForHydrated } from './utils';
import { resetE2eData } from './reset';
import { ensureMockChatModel } from './seed';

/**
 * v4.20 M2：500 条消息的长会话。
 *
 * 通过拦截 messages 接口注入历史，验证：
 * - >200 条自动窗口化，DOM 节点数远小于 500；
 * - 滚到顶部能看到最早消息，回到底部正常；
 * - 深链目标强制挂载并高亮；
 * - 设置关闭后回到全量渲染。
 */

const TOTAL = 500;

function buildMessages(conversationId: string) {
  const base = Date.UTC(2026, 10, 20, 0, 0, 0);
  return Array.from({ length: TOTAL }, (_, index) => ({
    id: `m-${index}`,
    conversationId,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content:
      index % 2 === 0
        ? `第 ${index} 条用户消息：请继续分析这个长会话场景。`
        : `第 ${index} 条助手回复：这里是用于窗口化验证的多行内容。\n第二段内容用于撑高消息气泡。`,
    status: 'completed',
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    citations: [],
    toolTrace: [],
    contentParts: [],
    feedback: null,
    feedbackAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date(base + index * 60_000).toISOString(),
  }));
}

test.beforeAll(async ({ request }) => {
  await resetE2eData(request);
});

test('v4.20 500 条消息：窗口化、滚动、深链与开关回退', async ({ page, request }) => {
  await request.put('/api/settings', { data: { hasOnboarded: true } });
  const model = await ensureMockChatModel(request, {
    providerName: 'E2E 长会话供应商',
    modelName: 'mock-chat',
  });
  const created = await request.post('/api/assistants', {
    data: { name: '长会话助手', modelId: model.modelId },
  });
  expect(created.ok(), `创建助手失败：${created.status()}`).toBeTruthy();
  const assistant = ((await created.json()) as { data: { id: string } }).data;

  const conversationResponse = await request.post('/api/conversations', {
    data: { assistantId: assistant.id, title: '长会话 500 条' },
  });
  expect(conversationResponse.ok(), `创建会话失败：${conversationResponse.status()}`).toBeTruthy();
  const conversation = ((await conversationResponse.json()) as { data: { id: string } }).data;
  const messages = buildMessages(conversation.id);

  await page.route(`**/api/conversations/${conversation.id}/messages`, (route) =>
    route.fulfill({ json: { success: true, data: messages } }),
  );

  await page.goto(`/chat?conversation=${conversation.id}`);
  await waitForHydrated(page);
  const list = page.getByTestId('message-list');
  await expect(list).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-message-id="m-499"]')).toBeVisible({ timeout: 20_000 });

  const rendered = await page.locator('[data-message-id]').count();
  expect(rendered, '窗口化后 DOM 消息数应远小于 500').toBeLessThan(200);

  await list.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect(page.locator('[data-message-id="m-0"]')).toBeVisible({ timeout: 15_000 });

  const back = page.getByTestId('scroll-to-bottom');
  await expect(back).toBeVisible();
  await back.click();
  await expect(page.locator('[data-message-id="m-499"]')).toBeVisible({ timeout: 15_000 });

  const p95FrameMs = await page.evaluate(async () => {
    const el = document.querySelector('[data-testid="message-list"]') as HTMLElement | null;
    if (!el) return Number.NaN;
    const frames: number[] = [];
    let last = performance.now();
    const start = performance.now();
    return await new Promise<number>((resolve) => {
      const step = (now: number) => {
        frames.push(now - last);
        last = now;
        el.scrollTop = Math.max(0, el.scrollTop - 40);
        if (now - start < 1_200) {
          requestAnimationFrame(step);
          return;
        }
        frames.sort((a, b) => a - b);
        resolve(frames[Math.floor(frames.length * 0.95)] ?? Number.NaN);
      };
      requestAnimationFrame(step);
    });
  });
  console.log(`[v4.20] 500 条消息滚动 p95 帧间隔：${p95FrameMs.toFixed(1)}ms`);
  expect(p95FrameMs).toBeLessThan(120);

  await page.goto(`/chat?conversation=${conversation.id}&message=m-450`);
  await waitForHydrated(page);
  await expect(
    page.locator('[data-message-id="m-450"][data-highlighted="true"]'),
  ).toBeVisible({ timeout: 20_000 });

  await request.put('/api/settings', { data: { chatVirtualizationEnabled: false } });
  await page.goto(`/chat?conversation=${conversation.id}`);
  await waitForHydrated(page);
  await expect
    .poll(async () => page.locator('[data-message-id]').count(), { timeout: 30_000 })
    .toBe(TOTAL);
});
