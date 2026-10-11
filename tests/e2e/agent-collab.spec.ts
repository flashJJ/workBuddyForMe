import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

/**
 * 服务端系统文案以 system-message 线格式（SOH + {k,vars} + STX）语言中立持久化。
 * e2e 运行时不打包 workspace 源码，这里只做最小 key 提取（断言系统模板身份），
 * 完整翻译渲染由 shared 单测覆盖。
 */
const decodeKey = (raw: string): string => {
  const m = /\u0001([^\u0001\u0002]+)\u0002/.exec(raw);
  if (!m) return raw;
  try {
    return (JSON.parse(m[1]!) as { k?: string }).k ?? raw;
  } catch {
    return raw;
  }
};

/**
 * v1.4 M5 多智能体协作端到端（WBFM_MOCK_AI=1，mock 角色协议确定性回放）：
 * ⓪ 普通对话路径零变化（任务模式关 → 无协作卡，mock 常规回复）
 * ① 一次通过：泳道卡一轮三角色 → done
 * ② 返工一次：revise → 第二轮泳道组
 * ③ 急停：协作中停止 → cancelled
 * ④ 预算熔断：maxRounds=1 + revise → budget_exceeded（API 驱动）
 * ⑤ Flow agent 节点：发布含 agent 节点的流程并试运行 → 节点成功 + agent_runs 归属
 */

const ASSISTANT_NAME = 'v14 协作助手';
const KB_NAME = 'v14-agent-e2e-kb';
const DOC_NAME = '制度.txt';
const DOC_CONTENT =
  '《年假制度》\n第一条 入职满一年的员工享有年假 15 天。\n第二条 年假提前 5 个工作日申请。\n第三条 病假复工当日补交医院证明。';

async function api<T = unknown>(request: APIRequestContext, method: string, path: string, body?: unknown): Promise<T> {
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
  modelIds: string[];
  assistantId: string;
  kbId: string;
  /** 首次 seed 后为 true；重复跑仅复用，不重复登记清理项 */
  created: boolean;
}

async function seedStack(page: Page): Promise<Seeded> {
  const request = page.request;
  // 供应商 + mock 模型（与 eval mock-seed 同形）
  const providers = await api<Array<{ id: string; name: string }>>(request, 'GET', '/providers');
  const preExisting = Boolean(providers.find((p) => p.name === 'v14-e2e-mock'));
  const provider =
    providers.find((p) => p.name === 'v14-e2e-mock') ??
    (await api<{ id: string; name: string }>(request, 'POST', '/providers', {
      name: 'v14-e2e-mock',
      protocol: 'openai-compatible',
      baseUrl: 'http://mock.local/v1',
      apiKey: 'sk-mock',
    }));
  const models = await api<Array<{ id: string; modelId: string }>>(request, 'GET', `/providers/${provider.id}/models`);
  const ensureModel = async (modelId: string, capabilities: string[]) => {
    if (!models.some((m) => m.modelId === modelId)) {
      await api(request, 'POST', `/providers/${provider.id}/models`, { modelId, capabilities });
    }
  };
  await ensureModel('mock-chat', ['chat']);
  await ensureModel('mock-embed', ['embedding']);
  const allModels = await api<Array<{ id: string; modelId: string }>>(request, 'GET', `/providers/${provider.id}/models`);
  const modelIds = allModels.filter((m) => ['mock-chat', 'mock-embed'].includes(m.modelId)).map((m) => m.id);
  const chatRow = allModels.find((m) => m.modelId === 'mock-chat')!;
  const embedRow = allModels.find((m) => m.modelId === 'mock-embed')!;

  // 编译向量化依赖默认向量模型，缺省会导致文档永远排队
  await api(request, 'PUT', '/settings', {
    defaultChatModelId: chatRow.id,
    defaultEmbeddingModelId: embedRow.id,
  });

  // 知识库 + 文档（编译 ready）
  const kbs = await api<Array<{ id: string; name: string }>>(request, 'GET', '/knowledge-bases');
  const kb: { id: string; name: string } =
    kbs.find((k) => k.name === KB_NAME) ??
    (await api(request, 'POST', '/knowledge-bases', { name: KB_NAME }));
  const docsNow = await api<Array<{ compileStatus: string }>>(request, 'GET', `/knowledge-bases/${kb.id}/documents`);
  if (docsNow.length === 0) {
    const upRes = await request.fetch(`/api/knowledge-bases/${kb.id}/documents`, {
      method: 'POST',
      multipart: {
        file: { name: DOC_NAME, mimeType: 'text/plain', buffer: Buffer.from(DOC_CONTENT, 'utf-8') },
      },
    });
    expect(upRes.ok()).toBeTruthy();
    const deadline = Date.now() + 60_000;
    for (;;) {
      const docs = await api<Array<{ compileStatus: string }>>(request, 'GET', `/knowledge-bases/${kb.id}/documents`);
      if (docs.some((d) => d.compileStatus === 'failed')) throw new Error('文档编译失败');
      if (docs.length >= 1 && docs.every((d) => d.compileStatus === 'ready')) break;
      if (Date.now() > deadline) throw new Error('等待编译超时');
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // 助手（绑定知识库 + 工具）
  const assistants = await api<Array<{ id: string; name: string }>>(request, 'GET', '/assistants');
  const existing = assistants.find((a) => a.name === ASSISTANT_NAME);
  const assistant: { id: string; name: string } = existing
    ? await api(request, 'PATCH', `/assistants/${existing.id}`, {
        knowledgeBaseIds: [kb.id],
        enabledTools: ['current_time', 'knowledge_search'],
      })
        .then(() => ({ id: existing.id, name: ASSISTANT_NAME }))
    : await api(request, 'POST', '/assistants', {
        name: ASSISTANT_NAME,
        systemPrompt: '你是协作 e2e 助手。',
        knowledgeBaseIds: [kb.id],
        enabledTools: ['current_time', 'knowledge_search'],
      });
  return {
    providerId: provider.id,
    modelIds,
    assistantId: assistant.id,
    kbId: kb.id,
    created: !preExisting,
  };
}

/** afterAll 清理：本 spec 在 critical-path 之前执行，必须把 seed 的供应商/助手/知识库全部删净，
 * 否则后续 spec 的非作用域选择器（如 [id^="model-id-"]）会命中多张卡片而失败 */
async function cleanupStack(request: APIRequestContext, seeded: Seeded): Promise<void> {
  const ignore404 = (p: Promise<unknown>) => p.catch(() => {});
  await ignore404(api(request, 'DELETE', `/assistants/${seeded.assistantId}`));
  await ignore404(api(request, 'DELETE', `/knowledge-bases/${seeded.kbId}`));
  for (const modelId of seeded.modelIds) {
    await ignore404(api(request, 'DELETE', `/models/${modelId}`));
  }
  if (seeded.created) await ignore404(api(request, 'DELETE', `/providers/${seeded.providerId}`));
}

async function skipOnboarding(page: Page): Promise<void> {
  const wizard = page.getByRole('dialog', { name: '首次使用向导' });
  try {
    // 冷启动 dev 编译首屏较慢，给足等待窗口再接「跳过」
    await wizard.waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByRole('button', { name: '跳过' }).click();
    await expect(wizard).toBeHidden();
  } catch {
    /* 已标记首启完成，向导未弹出 */
  }
}

async function openChatWithAssistant(page: Page, assistantId: string): Promise<void> {
  await page.goto('/chat');
  await skipOnboarding(page);
  // 按 value（assistantId）选择，避免依赖 emoji 前缀（API 建的助手无 emoji）
  await page.getByLabel('切换助手').selectOption(assistantId);
  await expect(page.getByTestId('task-mode-toggle')).toBeVisible();
}

/** API 驱动一次协作：建行→开 SSE（不读完，仅驱动执行）→轮询终态 */
async function runAgentViaApi(
  page: Page,
  input: { assistantId: string; goal: string; budget?: { maxRounds: number } },
): Promise<{ run: Record<string, unknown> }> {
  const conversation = await api<{ id: string }>(page.request, 'POST', '/conversations', {
    assistantId: input.assistantId,
    title: `e2e-agent-${Date.now()}`,
  });
  const run = await api<{ id: string }>(page.request, 'POST', '/agent/runs', {
    assistantId: input.assistantId,
    conversationId: conversation.id,
    goal: input.goal,
    ...(input.budget ? { budget: input.budget } : {}),
  });
  // 订阅即驱动（Playwright 请求为缓冲型，连接保持期间服务端执行；不 await）
  void page.request.get(`/api/agent/runs/${run.id}/events`).catch(() => {});
  const deadline = Date.now() + 60_000;
  let detail: { run: Record<string, unknown> };
  for (;;) {
    detail = await api(page.request, 'GET', `/agent/runs/${run.id}`);
    const status = detail.run.status as string;
    if (['done', 'failed', 'cancelled', 'budget_exceeded'].includes(status)) break;
    if (Date.now() > deadline) throw new Error(`协作未收敛（最后状态 ${status}）`);
    await new Promise((r) => setTimeout(r, 300));
  }
  return detail as { run: Record<string, unknown> };
}

test.describe.serial('v1.4 多智能体协作', () => {
  let seeded: Seeded;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    seeded = await seedStack(page);
    await page.close();
  });

  test.afterAll(async ({ request }) => {
    if (seeded) await cleanupStack(request, seeded);
  });

  test('⓪ 任务模式关闭时普通对话路径零变化（走常规对话流，无协作卡）', async ({ page }) => {
    await openChatWithAssistant(page, seeded.assistantId);
    await page.getByLabel('消息输入框').fill('你好呀');
    await page.getByLabel('消息输入框').press('Enter');

    // 常规对话回复（mock 回显语或 RAG 资料回显；二者必居其一）
    const reply = page.locator('main').getByText(/我是 mock 模型|根据检索到的资料/).first();
    await expect(reply).toBeVisible({ timeout: 30_000 });
    // 零变化核心：不出现协作泳道卡，开关保持关闭
    await expect(page.getByTestId('agent-run-card')).toHaveCount(0);
    expect(await page.getByTestId('task-mode-toggle').getAttribute('aria-pressed')).toBe('false');
  });

  test('① 一次通过：泳道卡一轮完成并交付结论', async ({ page }) => {
    await openChatWithAssistant(page, seeded.assistantId);
    await page.getByTestId('task-mode-toggle').click();
    await page.getByLabel('消息输入框').fill('查证年假有多少天 [conclusion:年假15天]');
    await page.getByLabel('消息输入框').press('Enter');

    const card = page.getByTestId('agent-run-card').first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
    await expect(page.getByTestId('agent-round-0')).toBeVisible();
    await expect(page.getByText(/年假15天/).first()).toBeVisible();
    // 泳道含证据文档名
    await expect(card).toContainText(DOC_NAME);
  });

  test('② 返工一次：revise 后出现第二轮泳道组', async ({ page }) => {
    await openChatWithAssistant(page, seeded.assistantId);
    await page.getByTestId('task-mode-toggle').click();
    await page.getByLabel('消息输入框').fill('查证年假天数 [review:revise-once] [conclusion:年假15天]');
    await page.getByLabel('消息输入框').press('Enter');

    const card = page.getByTestId('agent-run-card').first();
    await expect(card).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
    await expect(page.getByTestId('agent-round-1')).toBeVisible();
    // 第二轮带返工标记
    await expect(page.getByTestId('agent-round-1')).toContainText('返工');
    // 首轮裁决为 revise
    await expect(card).toContainText('返工');
  });

  test('③ 急停：协作进行中停止后收敛 cancelled', async ({ page }) => {
    await openChatWithAssistant(page, seeded.assistantId);
    await page.getByTestId('task-mode-toggle').click();
    await page.getByLabel('消息输入框').fill('慢慢查证年假制度 [slow:3000] [conclusion:年假15天]');
    await page.getByLabel('消息输入框').press('Enter');

    await expect(page.getByTestId('agent-run-card').first()).toBeVisible();
    await page.getByRole('button', { name: '停止生成' }).click();
    await expect(page.getByTestId('agent-run-card').first()).toHaveAttribute(
      'data-status',
      'cancelled',
      { timeout: 30_000 },
    );
  });

  test('④ 预算熔断：maxRounds=1 + revise → budget_exceeded（API 驱动）', async ({ page }) => {
    const { run } = await runAgentViaApi(page, {
      assistantId: seeded.assistantId,
      goal: '查证年假天数 [review:revise-once] [conclusion:年假15天]',
      budget: { maxRounds: 1 },
    });
    expect(run.status).toBe('budget_exceeded');
    expect(decodeKey(run.errorMessage as string)).toBe('agentTrace.budget.exceeded');
  });

  test('⑤ Flow agent 节点：发布 → 试运行成功，agent_runs 记录归属该 flow run', async ({ page }) => {
    // 1. 建流程 + 保存含 agent 节点的图 + 发布
    const wf = await api<{ id: string }>(page.request, 'POST', '/flows', {
      name: 'v14-agent-flow-e2e',
      description: 'agent 节点 e2e',
    });
    const graph = {
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: { inputs: [] } },
        {
          id: 'ag',
          type: 'agent',
          position: { x: 240, y: 0 },
          config: {
            goal: '查证年假天数 [conclusion:年假15天]',
            assistantId: seeded.assistantId,
            knowledgeBaseIds: [seeded.kbId],
            toolScopes: ['knowledge'],
          },
        },
        { id: 'end', type: 'end', position: { x: 480, y: 0 }, config: { output: '' } },
      ],
      edges: [
        { id: 'e-sa', source: 'start', target: 'ag' },
        { id: 'e-ae', source: 'ag', target: 'end' },
      ],
    };
    await api(page.request, 'POST', `/flows/${wf.id}/versions`, { graph });
    await api(page.request, 'POST', `/flows/${wf.id}/publish`, {});

    // 2. 试运行（订阅 SSE 驱动执行）
    const created = await api<{ runId: string }>(page.request, 'POST', `/flows/${wf.id}/runs`, { input: {} });
    const flowRunId = created.runId;
    void page.request.get(`/api/flows/runs/${flowRunId}/events`).catch(() => {});

    const deadline = Date.now() + 60_000;
    let status = '';
    for (;;) {
      const detail = await api<{ run: { status: string } }>(page.request, 'GET', `/flows/runs/${flowRunId}`);
      status = detail.run.status;
      if (['succeeded', 'failed', 'cancelled'].includes(status)) break;
      if (Date.now() > deadline) throw new Error(`Flow 未收敛（${status}）`);
      await new Promise((r) => setTimeout(r, 300));
    }
    expect(status).toBe('succeeded');

    // 3. agent_runs 归属该 flow run 且 done
    const agentRuns = await api<Array<{ flowRunId: string | null; status: string }>>(
      page.request,
      'GET',
      '/agent/runs',
    );
    const linked = agentRuns.find((r) => r.flowRunId === flowRunId);
    expect(linked, '应有 agent_run 关联到 flow run').toBeTruthy();
    expect(linked!.status).toBe('done');
  });
});
