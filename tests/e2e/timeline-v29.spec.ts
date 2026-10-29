import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const PROVIDER_NAME = 'v29-timeline-mock';
const ASSISTANT_NAME = 'v2.9 复盘助手';

/** WBFM_MOCK_AI 下幂等准备 mock 供应商/模型/助手 */
async function seedAssistant(request: APIRequestContext): Promise<string> {
  const providers = ((await request.get('/api/providers').then((r) => r.json())) as Envelope<
    Array<{ id: string; name: string }>
  >).data ?? [];
  let provider = providers.find((item) => item.name === PROVIDER_NAME);
  if (!provider) {
    const res = await request.post('/api/providers', {
      data: {
        name: PROVIDER_NAME,
        protocol: 'openai-compatible',
        baseUrl: 'http://mock.local/v1',
        apiKey: 'sk-mock-v29',
      },
    });
    provider = ((await res.json()) as Envelope<{ id: string; name: string }>).data!;
  }
  const models = ((await (
    await request.get(`/api/providers/${provider.id}/models`)
  ).json()) as Envelope<Array<{ id: string; modelId: string }>>).data ?? [];
  let model = models.find((item) => item.modelId === 'mock-chat');
  if (!model) {
    const res = await request.post(`/api/providers/${provider.id}/models`, {
      data: { modelId: 'mock-chat', capabilities: ['chat'] },
    });
    model = ((await res.json()) as Envelope<{ id: string; modelId: string }>).data!;
  }
  const res = await request.post('/api/assistants', {
    data: { name: ASSISTANT_NAME, modelId: model.id },
  });
  return ((await res.json()) as Envelope<{ id: string }>).data!.id;
}

async function skipOnboardingIfShown(page: Page): Promise<void> {
  const wizard = page.getByRole('dialog', { name: '首次使用向导' });
  try {
    await wizard.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    return;
  }
  await page.getByRole('button', { name: '跳过' }).click();
  await expect(wizard).toBeHidden();
}

type Envelope<T> = { data?: T };

test.describe.serial('v2.9 复盘时间线 / 检索 / 导出', () => {
  let assistantId = '';

  test.beforeAll(async ({ request }) => {
    await request.put('/api/settings', { data: { hasOnboarded: true } });
    assistantId = await seedAssistant(request);
  });

  test.afterAll(async ({ request }) => {
    if (assistantId) await request.delete(`/api/assistants/${assistantId}`);
    const providers = ((await request.get('/api/providers').then((r) => r.json())) as Envelope<
      Array<{ id: string; name: string }>
    >).data ?? [];
    const mine = providers.find((item) => item.name === PROVIDER_NAME);
    if (mine) await request.delete(`/api/providers/${mine.id}`);
  });

  test('对话事件可检索、可导出、可在时间线页重建', async ({ page }) => {

    const conversationRes = await page.request.post('/api/conversations', {
      data: { assistantId, title: 'v2.9 复盘会话' },
    });
    const conversation = ((await conversationRes.json()) as Envelope<{ id: string }>).data!;

    const chatRes = await page.request.post('/api/chat/stream', {
      data: { assistantId, conversationId: conversation.id, content: '暗号是青鸟' },
      timeout: 60_000,
    });
    expect(chatRes.ok()).toBeTruthy();

    const messagesRes = await page.request.get(
      `/api/conversations/${conversation.id}/messages`,
    );
    const messages = ((await messagesRes.json()) as Envelope<Array<{ role: string }>>).data ?? [];
    expect(messages.length).toBeGreaterThanOrEqual(2);

    const searchRes = await page.request.get('/api/search?q=%E9%9D%92%E9%B8%9F');
    expect(searchRes.ok()).toBeTruthy();
    const hits = ((await searchRes.json()) as Envelope<Array<{ scope: string; scopeId: string }>>)
      .data ?? [];
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.scope).toBe('chat');
    expect(hits[0]!.scopeId).toBe(conversation.id);

    const eventsRes = await page.request.get(
      `/api/events?scope=chat&scopeId=${conversation.id}`,
    );
    const timeline = ((await eventsRes.json()) as Envelope<{ items: Array<{ label: string }> }>)
      .data;
    expect(timeline?.items.length).toBeGreaterThanOrEqual(3);

    const exportRes = await page.request.get(
      `/api/export/session?scope=chat&scopeId=${conversation.id}`,
    );
    expect(exportRes.ok()).toBeTruthy();
    expect(exportRes.headers()['content-type']).toBe('application/zip');
    const bytes = await exportRes.body();
    expect(bytes.byteLength).toBeGreaterThan(0);

    await page.goto(`/timeline?scope=chat&id=${conversation.id}`);
    await skipOnboardingIfShown(page);
    await expect(page.getByTestId('timeline-page')).toBeVisible();
    await expect(page.getByTestId('timeline-events')).toBeVisible();
    await expect(page.getByText('助手回答完成')).toBeVisible();
  });

  test('运行报告页提供时间线入口', async ({ page }) => {
    await page.goto('/reports');
    await skipOnboardingIfShown(page);
    await expect(page.getByTestId('run-report-page')).toBeVisible();
    await expect(page.getByTestId('run-report-timeline-link')).toBeVisible();
  });
});
