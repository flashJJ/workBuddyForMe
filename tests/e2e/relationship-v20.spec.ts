import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { chooseOption, waitForHydrated } from './utils';

/**
 * v2.0 M1/M2 关系等级与共同里程碑 e2e（WBFM_MOCK_AI 数据根）。
 * 等级演算/日上限/检查点/里程碑评估由 core 单测保证，本规格锁 UI 契约 +
 * 「首次正向互动→day_1 达成→面板可见」真实链路。mock 模型栈幂等自播种
 *（只给本规格助手绑定 modelId，不动全局默认模型，避免污染其他 spec）。
 */

const ASSISTANT_NAME = '关系测试助手';
const PROVIDER_NAME = 'v20-e2e-mock';

async function skipOnboardingIfShown(page: Page): Promise<void> {
  // 冷编译下向导可能晚于数秒才挂载（dev 首轮编译），给足 15s
  const wizard = page.getByRole('dialog', { name: '首次使用向导' });
  try {
    await wizard.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    return; // 已标记首启完成，向导未弹出
  }
  await page.getByRole('button', { name: '跳过' }).click();
  await expect(wizard).toBeHidden();
}

/** 幂等准备 mock 供应商 + mock-chat 模型，返回模型行 id（供助手绑定） */
async function ensureMockChatModelId(request: APIRequestContext): Promise<string> {
  const providers = await request.get('/api/providers').then((r) => r.json());
  let provider = providers.data.find((p: { name: string }) => p.name === PROVIDER_NAME);
  if (!provider) {
    const res = await request.post('/api/providers', {
      data: {
        name: PROVIDER_NAME,
        protocol: 'openai-compatible',
        baseUrl: 'http://mock.local/v1',
        apiKey: 'sk-mock-v20',
      },
    });
    expect(res.ok()).toBeTruthy();
    provider = (await res.json()).data;
  }
  const modelsRes = await request.get(`/api/providers/${provider.id}/models`);
  const models = (await modelsRes.json()).data as Array<{ id: string; modelId: string }>;
  const existing = models.find((m) => m.modelId === 'mock-chat');
  if (existing) return existing.id;
  const created = await request.post(`/api/providers/${provider.id}/models`, {
    data: { modelId: 'mock-chat', capabilities: ['chat'] },
  });
  expect(created.ok()).toBeTruthy();
  return (await created.json()).data.id as string;
}

async function seedAssistant(
  request: APIRequestContext,
  modelId: string,
): Promise<string> {
  const res = await request.post('/api/assistants', {
    data: { name: ASSISTANT_NAME, modelId },
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { data: { id: string } }).data.id;
}

async function gotoSettings(page: Page): Promise<void> {
  await page.goto('/settings');
  await waitForHydrated(page);
  await skipOnboardingIfShown(page);
  await expect(page.getByTestId('relationship-panel')).toBeVisible();
  // v2.3：Radix 下拉无原生 value 可选，按助手名选择（API 建的助手无 emoji，选项文案即助手名）
  await chooseOption(page, page.locator('#relationship-assistant-select'), ASSISTANT_NAME);
  await expect(page.getByTestId('relationship-level-view')).toBeVisible();
}

test.describe.serial('v2.0 关系等级与共同里程碑', () => {
  let assistantId = '';

  test.beforeAll(async ({ request }) => {
    const modelId = await ensureMockChatModelId(request);
    assistantId = await seedAssistant(request, modelId);
  });

  test.afterAll(async ({ browser, request }) => {
    const page = await browser.newPage();
    await page.goto('/settings');
    await waitForHydrated(page);
    await skipOnboardingIfShown(page);
    await page.getByTestId('relationship-enabled-toggle').check({ force: true }).catch(() => {});
    await page.close();
    if (assistantId) await request.delete(`/api/assistants/${assistantId}`);
  });

  test('默认态：开关开；全新助手=陌生、三档未解锁；六个里程碑全部未达成', async ({ page }) => {
    await gotoSettings(page);
    await expect(page.getByTestId('relationship-enabled-toggle')).toBeChecked();
    await expect(page.getByTestId('relationship-current-level')).toContainText('陌生');
    await expect(page.locator('[data-testid^="relationship-level-row-"]')).toHaveCount(3);
    await expect(page.locator('[data-testid^="relationship-milestone-row-"]')).toHaveCount(6);
    await expect(page.getByTestId('relationship-milestones')).toContainText('相识第一天');
    await expect(page.getByTestId('relationship-milestone-row-day1')).toContainText('尚未达成');
    await expect(page.getByTestId('relationship-unlock-list')).toContainText('专属称呼');
    const body = await page.getByTestId('relationship-panel').innerText();
    expect(body).not.toContain('还差');
  });

  test('关闭：等级区隐藏；重载持久化；重开恢复', async ({ page }) => {
    await gotoSettings(page);
    await page.getByTestId('relationship-enabled-toggle').uncheck();
    await expect(page.getByTestId('relationship-level-view')).toHaveCount(0);
    await page.reload();
    await waitForHydrated(page);
    await expect(page.getByTestId('relationship-enabled-toggle')).not.toBeChecked();
    await page.getByTestId('relationship-enabled-toggle').check();
    await expect(page.getByTestId('relationship-level-view')).toBeVisible();
  });

  test('一次真实对话后：day_1 里程碑达成并在面板显示达成日期', async ({ page, request }) => {
    // 驱动一轮真实 mock 对话（emotion record → emotion_events 最早正向事件 → 懒评估）
    await page.goto('/chat');
    await waitForHydrated(page);
    await chooseOption(page, page.getByLabel('切换助手'), ASSISTANT_NAME);
    await page.getByLabel('消息输入框').fill('今天辛苦啦，谢谢你帮我');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(page.getByText(/mock 模型/).first()).toBeVisible({ timeout: 30_000 });

    // 气泡可见时回合后情绪/里程碑落库可能仍在进行：轮询服务端直到达成，避免抢跑
    await expect
      .poll(
        async () => {
          const res = await request.get(
            `/api/assistants/${assistantId}/relationship/milestones`,
          );
          const data = (await res.json()).data as Array<{ milestoneKey: string }>;
          return data.some((m) => m.milestoneKey === 'day_1');
        },
        { timeout: 30_000, intervals: [1_000] },
      )
      .toBeTruthy();

    await gotoSettings(page);
    const row = page.getByTestId('relationship-milestone-row-day1');
    await expect(row).not.toContainText('尚未达成', { timeout: 20_000 });
    await expect(row).toContainText('达成');
  });
});
