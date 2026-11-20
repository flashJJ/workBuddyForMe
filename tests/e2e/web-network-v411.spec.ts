import { expect, test, type APIRequestContext } from '@playwright/test';
import { chooseOption, waitForHydrated } from './utils';
import { FIXTURE_URL } from './network-fixture';

import { resetE2eData } from './reset';

// 文件级隔离：任何 spec 单独/乱序运行都从「刚安装」状态开始（见 reset.ts）
test.beforeAll(async ({ request }) => {
  await resetE2eData(request);
});

/**
 * v4.11 P1：联网检索的浏览器端到端路径。
 *
 * 覆盖 v4.11 事故的用户可见面：
 * - 连续抓取多个页面时不再逐页弹「工具执行确认」；
 * - 同轮抓取真实并发（用 Fake Web 的请求到达时间取证，而不是绝对毫秒）；
 * - 工具时间线展示 3 次成功调用，最终回答拿到 3 条工具结果。
 *
 * 场景由 WBFM_MOCK_SCENARIO 驱动（playwright.config 注入），
 * 系统侧权限、预算、抓取、SSE 全部走真实代码。
 */

const PROVIDER_NAME = 'v411-net-e2e-mock';
const ASSISTANT_NAME = 'v411 联网验收助手';

interface Envelope<T> {
  data: T;
}

/** 幂等准备 mock 供应商 / 128K 模型 / 只启用抓取的助手 */
async function seedAssistant(
  request: APIRequestContext,
): Promise<{ assistantId: string; providerId: string }> {
  const providerRes = await request.post('/api/providers', {
    data: {
      name: PROVIDER_NAME,
      protocol: 'openai-compatible',
      baseUrl: 'http://mock.local/v1',
      apiKey: 'sk-mock-v411',
    },
  });
  expect(providerRes.ok()).toBeTruthy();
  const provider = ((await providerRes.json()) as Envelope<{ id: string }>).data;

  const modelRes = await request.post(`/api/providers/${provider.id}/models`, {
    data: {
      modelId: 'mock-chat',
      capabilities: ['chat'],
      // 标准档 6 页上限需要真实窗口；否则 8K 回落的硬保险丝会按设计拒绝第 4 页
      contextWindow: 128_000,
    },
  });
  expect(modelRes.ok()).toBeTruthy();
  const model = ((await modelRes.json()) as Envelope<{ id: string }>).data;

  const assistantRes = await request.post('/api/assistants', {
    data: {
      name: ASSISTANT_NAME,
      modelId: model.id,
      enabledTools: ['fetch_webpage'],
    },
  });
  expect(assistantRes.ok()).toBeTruthy();
  const assistant = ((await assistantRes.json()) as Envelope<{ id: string }>).data;
  return { assistantId: assistant.id, providerId: provider.id };
}

test.describe.serial('v4.11 联网检索 E2E', () => {
  let assistantId = '';
  let providerId = '';

  test.beforeAll(async ({ request }) => {
    await request.put('/api/settings', { data: { hasOnboarded: true } });
    const seeded = await seedAssistant(request);
    assistantId = seeded.assistantId;
    providerId = seeded.providerId;
  });

  test.afterAll(async ({ request }) => {
    if (assistantId) await request.delete(`/api/assistants/${assistantId}`).catch(() => undefined);
    if (providerId) await request.delete(`/api/providers/${providerId}`).catch(() => undefined);
  });

  test('三页并发抓取：零人工确认、工具全部成功、结果入模', async ({ page, request }) => {
    await page.goto('/chat');
    await waitForHydrated(page);
    await chooseOption(page, page.getByLabel('切换助手'), new RegExp(ASSISTANT_NAME));

    await request.post(`${FIXTURE_URL}/__reset`);

    const confirm = page.getByRole('dialog', { name: '工具执行确认' });
    const reply = page.getByText(/抓取完成。观测：/);
    await page.getByLabel('消息输入框').fill('[scenario:fetch-concurrent] 请并发抓取三个页面');
    await page.getByLabel('消息输入框').press('Enter');

    // 完成或弹确认，二者先到先判：弹确认时下面的 toHaveCount(0) 会给出明确失败
    await expect(reply.or(confirm).first()).toBeVisible({ timeout: 30_000 });
    await expect(confirm).toHaveCount(0);
    await expect(reply).toBeVisible();

    // 模型实际拿到 3 条工具结果（{{toolState}} 探针）
    await expect(reply).toContainText('"count":3');

    // 工具时间线：3 次 fetch_webpage 全部成功
    const trace = page.getByTestId('tool-trace').last();
    await expect(trace).toBeVisible();
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

    // 并发取证：三个慢请求的到达跨度远小于 3×300ms 的串行下限
    const stats = (await (await request.get(`${FIXTURE_URL}/__stats`)).json()) as {
      requests: Array<{ path: string; at: number }>;
    };
    const slow = stats.requests.filter((item) => item.path === '/slow');
    expect(slow).toHaveLength(3);
    const spread = Math.max(...slow.map((item) => item.at)) - Math.min(...slow.map((item) => item.at));
    expect(spread).toBeLessThan(150);
  });
});
