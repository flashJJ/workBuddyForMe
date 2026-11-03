import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { chooseOption, waitForHydrated } from './utils';

/**
 * v2.20 M5 阶段条 e2e：
 * - 会话计划 → 顶部阶段条渲染、切换；
 * - 载入任务只写入输入框、不发送；
 * - 非空草稿阻止载入；
 * - 会话级模型切换写入 plan 与会话；
 * - 编辑对话框保存回写。
 * 自带 mock 供应商/模型，不依赖其他套件的执行顺序。
 */

type Envelope<T> = { data?: T };
const PROVIDER_NAME = 'v220-stage-mock';
/** 与全量套件里其他 mock-chat 区分，避免同名模型选中第一条时落到别的供应商 */
const MODEL_ID = 'v220-stage-chat';

async function seedChatModel(request: APIRequestContext): Promise<string> {
  const providers =
    ((await request.get('/api/providers').then((r) => r.json())) as Envelope<
      Array<{ id: string; name: string }>
    >).data ?? [];
  let provider = providers.find((item) => item.name === PROVIDER_NAME);
  if (!provider) {
    const res = await request.post('/api/providers', {
      data: {
        name: PROVIDER_NAME,
        protocol: 'openai-compatible',
        baseUrl: 'http://mock.local/v1',
        apiKey: 'sk-mock-v220',
      },
    });
    provider = ((await res.json()) as Envelope<{ id: string; name: string }>).data!;
  }

  const models =
    ((await (
      await request.get(`/api/providers/${provider.id}/models`)
    ).json()) as Envelope<Array<{ id: string; modelId: string }>>).data ?? [];
  const existing = models.find((item) => item.modelId === MODEL_ID);
  if (existing) return existing.id;

  const res = await request.post(`/api/providers/${provider.id}/models`, {
    data: { modelId: MODEL_ID, capabilities: ['chat'] },
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

async function readPlan(request: APIRequestContext, conversationId: string) {
  return ((await (await request.get(`/api/conversations/${conversationId}/stage-plan`)).json()) as Envelope<{
    plan: { activeStep: number | null; steps: Array<{ title: string; modelId: string | null }> };
  }>).data!.plan;
}

test.describe.serial('v2.20 阶段条', () => {
  let modelId = '';
  let previousDefaultModelId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const settings = ((await (await request.get('/api/settings')).json()) as Envelope<{
      defaultChatModelId?: string | null;
    }>).data;
    previousDefaultModelId = settings?.defaultChatModelId ?? null;
    modelId = await seedChatModel(request);
    await request.put('/api/settings', {
      data: { hasOnboarded: true, defaultChatModelId: modelId },
    });
  });

  test.afterAll(async ({ request }) => {
    // 全量套件共用数据根：恢复默认模型，避免后续用例落入无模型引导态
    await request.put('/api/settings', { data: { defaultChatModelId: previousDefaultModelId } });
    const providers =
      ((await request.get('/api/providers').then((r) => r.json())) as Envelope<
        Array<{ id: string; name: string }>
      >).data ?? [];
    const mine = providers.find((item) => item.name === PROVIDER_NAME);
    if (mine) await request.delete(`/api/providers/${mine.id}`);
  });

  test('切换阶段、载入任务、会话模型与编辑保存', async ({ page, request }) => {
    const created = (await (await request.post('/api/conversations', {
      data: { assistantId: 'builtin-general', title: '阶段条 e2e' },
    })).json()) as Envelope<{ id: string }>;
    const conversationId = created.data!.id;

    const plan = {
      activeStep: 0,
      steps: [
        { title: '调研', modelId: null, skillNames: [], goal: '整理竞品', deliverables: '对比表' },
        { title: '执行', modelId: null, skillNames: [], goal: '按结论推进', deliverables: '' },
      ],
    };
    const saved = await request.put(`/api/conversations/${conversationId}/stage-plan`, { data: plan });
    expect(saved.ok()).toBeTruthy();

    await page.goto(`/chat?conversation=${conversationId}`);
    await waitForHydrated(page);
    await skipOnboardingIfShown(page);

    const bar = page.getByTestId('chat-stage-bar');
    await expect(bar).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('stage-chip-0')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('stage-chip-1')).toHaveAttribute('aria-pressed', 'false');

    // 载入任务：写入输入框但不发送
    await page.getByTestId('stage-load-task').click();
    const input = page.getByLabel('消息输入框');
    await expect(input).toHaveValue(/执行阶段：调研/);
    await expect(input).toHaveValue(/整理竞品/);
    await expect(page.getByText('任务已载入输入框')).toBeVisible();
    const messages = ((await (
      await request.get(`/api/conversations/${conversationId}/messages`)
    ).json()) as Envelope<unknown[]>).data ?? [];
    expect(messages).toHaveLength(0);

    // 非空草稿阻止再次载入
    await page.getByTestId('stage-load-task').click();
    await expect(page.getByText('输入框已有内容，先发送或清空再载入任务')).toBeVisible();
    await input.fill('');

    // 切阶段：写入 activeStep
    await page.getByTestId('stage-chip-1').click();
    await expect(page.getByTestId('stage-chip-1')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await readPlan(request, conversationId)).activeStep).toBe(1);

    // 会话级模型：选中阶段模型 → plan 与会话同时写入
    await chooseOption(page, page.getByTestId('stage-model-select'), `${MODEL_ID}（${MODEL_ID}）`);
    await expect(page.getByText('已切换本会话模型')).toBeVisible();
    await expect.poll(async () => (await readPlan(request, conversationId)).steps[1]?.modelId).toBe(modelId);
    const conversation = ((await (
      await request.get(`/api/conversations/${conversationId}`)
    ).json()) as Envelope<{ modelId: string | null }>).data!;
    expect(conversation.modelId).toBe(modelId);

    // 切回跟随助手 → 清空阶段与会话模型
    await chooseOption(page, page.getByTestId('stage-model-select'), '跟随助手默认');
    await expect.poll(async () => (await readPlan(request, conversationId)).steps[1]?.modelId).toBeNull();
    const cleared = ((await (
      await request.get(`/api/conversations/${conversationId}`)
    ).json()) as Envelope<{ modelId: string | null }>).data!;
    expect(cleared.modelId).toBeNull();

    // 编辑对话框保存回写
    await page.getByTestId('stage-edit').click();
    const editor = page.getByTestId('stage-plan-editor');
    await expect(editor).toBeVisible();
    await page.getByTestId('stage-editor-title-0').fill('调研阶段');
    await page.getByTestId('stage-editor-save').click();
    await expect(editor).toBeHidden();
    await expect.poll(async () => (await readPlan(request, conversationId)).steps[0]?.title).toBe('调研阶段');
  });
});
