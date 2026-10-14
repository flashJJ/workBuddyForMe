import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { waitForHydrated } from './utils';

/**
 * v1.9 M2 舞台协作 run 适配器 e2e（WBFM_MOCK_AI=1）：
 * - owner SSE 由 APIRequestContext 持有（模拟主会话），舞台是只读第二客户端；
 * - 舞台先以 connecting 打开，owner 接通后看到 live 现场（动作副线/三槽 cast）；
 * - 舞台零执行控件（无演示/中断/审批/返工）；
 * - 关闭舞台页不杀 run：owner 侧轮询到终态落库；重开舞台走终态回放续看谢幕。
 */

const PROVIDER_NAME = 'v19-stage-mock';
const ASSISTANT_NAME = 'v19 舞台助手';

async function api<T = unknown>(
  request: APIRequestContext,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await request.fetch(`/api${path}`, {
    method,
    data: body === undefined ? undefined : (body as object),
  });
  const payload = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: T; error?: { message: string } }
    | null;
  if (!res.ok() || payload?.success === false || payload?.error) {
    throw new Error(`${method} ${path} → HTTP ${res.status()} ${payload?.error?.message ?? ''}`);
  }
  return payload!.data as T;
}

interface Seeded {
  providerId: string;
  modelId: string;
  assistantId: string;
  createdProvider: boolean;
  /** seed 前的默认模型设置（cleanup 还原，避免后续 spec「无可用对话模型」） */
  previousDefaultModelId: string | null;
}

async function seedStack(request: APIRequestContext): Promise<Seeded> {
  const settingsBefore = await api<{ defaultChatModelId?: string | null }>(
    request,
    'GET',
    '/settings',
  );
  const providers = await api<Array<{ id: string; name: string }>>(request, 'GET', '/providers');
  const existingProvider = providers.find((p) => p.name === PROVIDER_NAME);
  const createdProvider = !existingProvider;
  const provider =
    existingProvider ??
    (await api<{ id: string }>(request, 'POST', '/providers', {
      name: PROVIDER_NAME,
      protocol: 'openai-compatible',
      baseUrl: 'http://mock.local/v1',
      apiKey: 'sk-mock',
    }));

  const models = await api<Array<{ id: string; modelId: string }>>(
    request,
    'GET',
    `/providers/${provider.id}/models`,
  );
  const model =
    models.find((m) => m.modelId === 'mock-chat') ??
    (await api<{ id: string }>(request, 'POST', `/providers/${provider.id}/models`, {
      modelId: 'mock-chat',
      capabilities: ['chat'],
    }));

  await request.put('/api/settings', { data: { defaultChatModelId: model.id } });

  const assistants = await api<Array<{ id: string; name: string }>>(request, 'GET', '/assistants');
  const assistant =
    assistants.find((a) => a.name === ASSISTANT_NAME) ??
    (await api<{ id: string }>(request, 'POST', '/assistants', {
      name: ASSISTANT_NAME,
      systemPrompt: '你是舞台 e2e 助手。',
    }));

  return {
    providerId: provider.id,
    modelId: model.id,
    assistantId: assistant.id,
    createdProvider,
    previousDefaultModelId: settingsBefore.defaultChatModelId ?? null,
  };
}

async function cleanupStack(request: APIRequestContext, seeded: Seeded): Promise<void> {
  // 先还原默认模型指针（允许 null），再删助手/模型/供应商，顺序不可颠倒
  await api(request, 'PUT', '/settings', {
    defaultChatModelId: seeded.previousDefaultModelId,
  }).catch(() => {});
  await api(request, 'DELETE', `/assistants/${seeded.assistantId}`).catch(() => {});
  await api(request, 'DELETE', `/models/${seeded.modelId}`).catch(() => {});
  if (seeded.createdProvider) {
    await api(request, 'DELETE', `/providers/${seeded.providerId}`).catch(() => {});
  }
}

async function openStageRun(page: Page, runId: string): Promise<void> {
  await page.goto(`/stage?run=${encodeURIComponent(runId)}`);
  await waitForHydrated(page);
  await expect(page.getByTestId('stage-root')).toHaveAttribute('data-mode', 'run');
}

test.describe.serial('v1.9 M2 舞台协作 run（只读观察）', () => {
  let seeded: Seeded;

  test.beforeAll(async ({ request }) => {
    await request.put('/api/settings', { data: { hasOnboarded: true } });
    seeded = await seedStack(request);
  });

  test.afterAll(async ({ request }) => {
    await cleanupStack(request, seeded);
  });

  test('owner 在主会话驱动时，舞台只读观看；关窗不杀 run；重开从终态回放续看', async ({
    page,
    request,
  }) => {
    const conversation = await api<{ id: string }>(request, 'POST', '/conversations', {
      assistantId: seeded.assistantId,
      title: `e2e-stage-${Date.now()}`,
    });
    const run = await api<{ id: string }>(request, 'POST', '/agent/runs', {
      assistantId: seeded.assistantId,
      conversationId: conversation.id,
      goal: '舞台联调验证 [conclusion:舞台联调通过]',
    });

    // 1) 舞台先打开：owner 尚未接通，显示 connecting 并退避重连（无 409 致命错误）
    await openStageRun(page, run.id);
    await expect(page.getByTestId('stage-run-status')).toHaveAttribute('data-state', 'connecting');

    // 2) 三槽 cast 就位（规划左/执行中/审查右），且零执行控件
    for (const [slot, name] of [
      ['left', '规划'],
      ['center', '执行'],
      ['right', '审查'],
    ] as const) {
      await expect(page.getByTestId(`stage-nameplate-${slot}`)).toContainText(name);
    }
    await expect(page.getByTestId('stage-demo-section')).toBeHidden();
    await expect(
      page.getByRole('button').filter({ hasText: /中断|审批|返工|急停/ }),
    ).toHaveCount(0);

    // 3) owner 此刻才接通 SSE（主会话持有），舞台经服务端等待队列原子挂上 live 现场。
    //    mock run 极快（<1s），瞬态 motion 不做时序断言（帧→指令映射由适配器纯函数单测覆盖），
    //    只确定性校验：状态从 connecting 进入 running/done，绝不 failed。
    void request.get(`/api/agent/runs/${run.id}/events`).catch(() => {});
    await expect
      .poll(
        async () =>
          (await page.getByTestId('stage-run-status').getAttribute('data-state')) ?? 'connecting',
        { timeout: 20_000 },
      )
      .toMatch(/^running|done$/);

    // 4) run 启动瞬间关闭舞台窗（owner SSE 在主会话/测试上下文持有，与页面无关）
    await page.close();
    const deadline = Date.now() + 60_000;
    let status = 'running';
    for (;;) {
      const detail = await api<{ run: { status: string } }>(
        request,
        'GET',
        `/agent/runs/${run.id}`,
      );
      status = detail.run.status;
      if (['done', 'failed', 'cancelled', 'budget_exceeded'].includes(status)) break;
      if (Date.now() > deadline) throw new Error(`协作未收敛（最后状态 ${status}）`);
      await new Promise((r) => setTimeout(r, 400));
    }
    expect(status).toBe('done');

    // 5) 重开舞台：终态回放（handoffs + done），三槽仍在，审查者喜悦 + 谢幕台词可续看
    const reopen = await page.context().newPage();
    await openStageRun(reopen, run.id);
    await expect(reopen.getByTestId('stage-run-status')).toHaveAttribute('data-state', 'done', {
      timeout: 15_000,
    });
    await expect(reopen.getByTestId('stage-nameplate-right')).toContainText('开心');
    await expect(reopen.getByTestId('stage-dialog')).toContainText(/协作完成|验收通过/);
    await reopen.close();
  });
});
