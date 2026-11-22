import { expect, test } from '@playwright/test';
import { waitForHydrated } from './utils';
import { resetE2eData } from './reset';
import { ensureMockChatModel } from './seed';

/**
 * v4.20 M3：长文本在三档窄窗下不横向溢出。
 *
 * 用拦截 messages 接口注入长中文、长 URL 与长代码行，
 * 校验文档与消息容器 scrollWidth 不超过 clientWidth，输入区仍可用。
 */

const SIZES = [
  { name: 'narrow-1024', width: 1024, height: 768 },
  { name: 'mid-1280', width: 1280, height: 800 },
  { name: 'wide-1440', width: 1440, height: 900 },
] as const;

const LONG_TOKEN = 'A'.repeat(260);
const LONG_URL = `https://example.com/path?token=${'a'.repeat(220)}`;

let conversationId = '';

function buildMessages(id: string) {
  const longText = [
    `长文本段落：${'这是一个用于验证换行与溢出的中文长句子，'.repeat(20)}`,
    `不可断长词：${LONG_TOKEN}`,
    `长链接：${LONG_URL}`,
    '```ts',
    `const value = '${'x'.repeat(200)}';`,
    '```',
  ].join('\n\n');
  return Array.from({ length: 40 }, (_, index) => ({
    id: `long-${index}`,
    conversationId: id,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: index === 39 ? longText : longText.slice(0, 120 + (index % 5) * 40),
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
    createdAt: new Date(Date.UTC(2026, 10, 20) + index * 60_000).toISOString(),
  }));
}

test.beforeAll(async ({ request }) => {
  await resetE2eData(request);
  await request.put('/api/settings', { data: { hasOnboarded: true } });
  const model = await ensureMockChatModel(request, {
    providerName: 'E2E 长文本供应商',
    modelName: 'mock-chat',
  });
  const assistantResponse = await request.post('/api/assistants', {
    data: { name: '长文本助手', modelId: model.modelId },
  });
  expect(assistantResponse.ok()).toBeTruthy();
  const assistant = ((await assistantResponse.json()) as { data: { id: string } }).data;
  const conversationResponse = await request.post('/api/conversations', {
    data: { assistantId: assistant.id, title: '长文本窗口' },
  });
  expect(conversationResponse.ok()).toBeTruthy();
  conversationId = ((await conversationResponse.json()) as { data: { id: string } }).data.id;
});

for (const size of SIZES) {
  test(`${size.name} ${size.width}×${size.height}：长文本无横向溢出`, async ({ page }) => {
    await page.route(`**/api/conversations/${conversationId}/messages`, (route) =>
      route.fulfill({ json: { success: true, data: buildMessages(conversationId) } }),
    );
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(`/chat?conversation=${conversationId}`);
    await waitForHydrated(page);
    const list = page.getByTestId('message-list');
    await expect(list).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('composer')).toBeVisible();

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      const listEl = document.querySelector('[data-testid="message-list"]') as HTMLElement | null;
      return {
        document: root.scrollWidth - root.clientWidth,
        list: listEl ? listEl.scrollWidth - listEl.clientWidth : 0,
      };
    });
    expect(overflow.document, '文档不应出现横向滚动').toBeLessThanOrEqual(1);
    expect(overflow.list, '消息容器不应出现横向滚动').toBeLessThanOrEqual(1);

    await page.screenshot({ path: `test-results/responsive-v420/${size.name}-longtext.png` });
  });
}
