import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { waitForHydrated } from './utils';

/**
 * v2.21 分支 e2e：
 * - 派生（autoStart=false）→ 顶栏分支面板可见、状态排队、预算视图；
 * - 归档 → 折叠区可见 → 恢复；
 * - 删除（运行中先停的确认路径）后子会话保留；
 * - run-graph?scope=branch 可见分支节点。
 * 不依赖真实供应商：队列/取消/上限用例停在 queued；运行用例走 WBFM_MOCK_AI 的 mock-chat。
 */

type Envelope<T> = { data?: T };

const MOCK_PROVIDER = 'v221-branch-mock';
const MOCK_ASSISTANT = 'v2.21 分支 Mock 助手';

/** WBFM_MOCK_AI 下幂等准备 mock 供应商/模型/助手，供真实运行分支用例 */
async function seedMockAssistant(
  request: APIRequestContext,
): Promise<{ providerId: string; assistantId: string }> {
  const providers = ((await request.get('/api/providers').then((r) => r.json())) as Envelope<
    Array<{ id: string; name: string }>
  >).data ?? [];
  let provider = providers.find((item) => item.name === MOCK_PROVIDER);
  if (!provider) {
    const res = await request.post('/api/providers', {
      data: {
        name: MOCK_PROVIDER,
        protocol: 'openai-compatible',
        baseUrl: 'http://mock.local/v1',
        apiKey: 'sk-mock-v221',
      },
    });
    provider = ((await res.json()) as Envelope<{ id: string; name: string }>).data!;
  }
  const models = ((await (
    await request.get(`/api/providers/${provider.id}/models`)
  ).json()) as Envelope<Array<{ id: string; modelId: string }>>).data ?? [];
  const model =
    models.find((item) => item.modelId === 'mock-chat') ??
    ((await (
      await request.post(`/api/providers/${provider.id}/models`, {
        data: { modelId: 'mock-chat', capabilities: ['chat'] },
      })
    ).json()) as Envelope<{ id: string }>).data!;
  const assistant = ((await (
    await request.post('/api/assistants', {
      data: { name: MOCK_ASSISTANT, modelId: model.id },
    })
  ).json()) as Envelope<{ id: string }>).data!;
  return { providerId: provider.id, assistantId: assistant.id };
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

test.describe.serial('v2.21 分支会话', () => {
  test.beforeAll(async ({ request }) => {
    // 独立数据根每次都会弹首次向导；先置已引导，避免遮罩拦截点击
    await request.put('/api/settings', { data: { hasOnboarded: true } });
  });

  test('派生 → 面板 → 归档/恢复 → 删除保留子会话；图可见分支节点', async ({ page }) => {
    const assistants =
      ((await (await page.request.get('/api/assistants')).json()) as Envelope<Array<{ id: string }>>)
        .data ?? [];
    expect(assistants.length).toBeGreaterThan(0);

    const parentRes = await page.request.post('/api/conversations', {
      data: { assistantId: assistants[0]!.id, title: 'v2.21 父会话' },
    });
    expect(parentRes.status()).toBe(201);
    const parent = ((await parentRes.json()) as Envelope<{ id: string }>).data!;

    const createRes = await page.request.post(`/api/conversations/${parent.id}/branches`, {
      data: { goal: '整理 v2.21 e2e 分支目标', title: 'e2e 分支', autoStart: false },
    });
    expect(createRes.status()).toBe(201);
    const created = ((await createRes.json()) as Envelope<{
      branch: { id: string; status: string };
      childConversationId: string;
    }>).data!;
    expect(created.branch.status).toBe('queued');

    const listRes = await page.request.get(
      `/api/conversations/${parent.id}/branches?includeArchived=true`,
    );
    const listed = ((await listRes.json()) as Envelope<{
      branches: Array<{ id: string }>;
      budget: { limitTokens: number };
    }>).data!;
    expect(listed.branches.map((branch) => branch.id)).toContain(created.branch.id);
    expect(listed.budget.limitTokens).toBe(200000);

    await page.goto(`/chat?conversation=${parent.id}`);
    await skipOnboardingIfShown(page);
    await waitForHydrated(page);

    await page.getByTestId('branch-open').click();
    const panel = page.getByTestId('branch-panel');
    await expect(panel).toBeVisible();
    const card = page.getByTestId(`branch-card-${created.branch.id}`);
    await expect(card).toBeVisible();
    await expect(card).toContainText('e2e 分支');
    await expect(card).toContainText('排队');
    await expect(page.getByTestId('branch-budget')).toContainText('上限 200000');

    // 图投影：分支节点在 branch scope 可见（删除关联前检查，事件随分支车道路由）
    const graphRes = await page.request.get(
      `/api/conversations/${parent.id}/run-graph?scope=branch`,
    );
    const graph = ((await graphRes.json()) as Envelope<{
      nodes: Array<{ kind: string; scopeId: string }>;
    }>).data!;
    expect(graph.nodes.some((node) => node.kind === 'branch' && node.scopeId === created.branch.id)).toBe(
      true,
    );

    // 归档 → 折叠区 → 恢复；图车道的归档标记随之切换
    await card.getByRole('button', { name: '归档' }).click();
    await expect(card).toBeHidden();
    const archivedGraph = ((await (
      await page.request.get(`/api/conversations/${parent.id}/run-graph?scope=branch`)
    ).json()) as Envelope<{ lanes: Array<{ id: string; archived?: boolean }> }>).data!;
    expect(archivedGraph.lanes.find((lane) => lane.id === `lane:branch:${created.branch.id}`)?.archived).toBe(
      true,
    );
    await panel.getByText('已归档 (1)').click();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: '恢复' }).click();
    // 等恢复 mutation 落库并刷新列表，再读图
    await expect(card.getByRole('button', { name: '归档' })).toBeVisible();
    const restoredGraph = ((await (
      await page.request.get(`/api/conversations/${parent.id}/run-graph?scope=branch`)
    ).json()) as Envelope<{ lanes: Array<{ id: string; archived?: boolean }> }>).data!;
    expect(restoredGraph.lanes.find((lane) => lane.id === `lane:branch:${created.branch.id}`)?.archived).toBe(
      false,
    );

    // 删除：确认弹窗后关联移除，子会话保留
    page.once('dialog', (dialog) => void dialog.accept());
    await card.getByRole('button', { name: '删除' }).click();
    await expect(page.getByTestId(`branch-card-${created.branch.id}`)).toHaveCount(0);

    const childRes = await page.request.get(`/api/conversations/${created.childConversationId}`);
    expect(childRes.status()).toBe(200);

    await page.request.delete(`/api/conversations/${created.childConversationId}`);
    await page.request.delete(`/api/conversations/${parent.id}`);
  });

  test('排队分支可在面板取消 → 终态已取消', async ({ page }) => {
    const assistants =
      ((await (await page.request.get('/api/assistants')).json()) as Envelope<Array<{ id: string }>>)
        .data ?? [];
    const parent = ((await (
      await page.request.post('/api/conversations', {
        data: { assistantId: assistants[0]!.id, title: 'v2.21 取消父会话' },
      })
    ).json()) as Envelope<{ id: string }>).data!;
    const created = ((await (
      await page.request.post(`/api/conversations/${parent.id}/branches`, {
        data: { goal: '取消队列中的分支', title: 'e2e 取消分支', autoStart: false },
      })
    ).json()) as Envelope<{ branch: { id: string }; childConversationId: string }>).data!;

    await page.goto(`/chat?conversation=${parent.id}`);
    await skipOnboardingIfShown(page);
    await waitForHydrated(page);
    await page.getByTestId('branch-open').click();
    const card = page.getByTestId(`branch-card-${created.branch.id}`);
    await expect(card).toContainText('排队');
    await card.getByRole('button', { name: '取消' }).click();
    await expect(card).toContainText('已取消');

    await page.request.delete(`/api/branches/${created.branch.id}`);
    await page.request.delete(`/api/conversations/${created.childConversationId}`);
    await page.request.delete(`/api/conversations/${parent.id}`);
  });

  test('分支真实运行（mock 模型）→ 成功并生成需核对回传卡片', async ({ page, request }) => {
    const seed = await seedMockAssistant(request);
    let parentId = '';
    let branchId = '';
    let childId = '';
    try {
      parentId = ((await (
        await request.post('/api/conversations', {
          data: { assistantId: seed.assistantId, title: 'v2.21 运行父会话' },
        })
      ).json()) as Envelope<{ id: string }>).data!.id;
      const created = ((await (
        await request.post(`/api/conversations/${parentId}/branches`, {
          data: { goal: '用 mock 模型回答分支目标', title: 'e2e 运行分支', autoStart: true },
        })
      ).json()) as Envelope<{ branch: { id: string }; childConversationId: string }>).data!;
      branchId = created.branch.id;
      childId = created.childConversationId;

      await expect
        .poll(
          async () => {
            const detail = ((await (await request.get(`/api/branches/${branchId}`)).json()) as Envelope<{
              branch: { status: string };
            }>).data!;
            return detail.branch.status;
          },
          { timeout: 90_000 },
        )
        .toMatch(/succeeded|failed|interrupted/);

      const detail = ((await (await request.get(`/api/branches/${branchId}`)).json()) as Envelope<{
        branch: { status: string };
        evidence: { summary: string; needsReview: boolean; usage: { totalTokens: number } | null } | null;
      }>).data!;
      expect(detail.branch.status).toBe('succeeded');
      expect(detail.evidence?.needsReview).toBe(true);
      expect(detail.evidence?.summary.length).toBeGreaterThan(0);
      expect(detail.evidence?.usage?.totalTokens).toBeGreaterThan(0);

      await page.goto(`/chat?conversation=${parentId}`);
      await waitForHydrated(page);
      await page.getByTestId('branch-open').click();
      const card = page.getByTestId(`branch-card-${branchId}`);
      await expect(card).toContainText('成功');
      await expect(card.getByTestId(`branch-evidence-${branchId}`)).toBeVisible();
    } finally {
      if (branchId) await request.delete(`/api/branches/${branchId}`);
      if (childId) await request.delete(`/api/conversations/${childId}`);
      if (parentId) await request.delete(`/api/conversations/${parentId}`);
      await request.delete(`/api/assistants/${seed.assistantId}`);
      await request.delete(`/api/providers/${seed.providerId}`);
    }
  });

  test('上限拒绝：父会话子分支数 1 时第二次派生返回 422', async ({ page }) => {
    await page.request.put('/api/settings', { data: { branchMaxChildren: 1 } });
    const assistants =
      ((await (await page.request.get('/api/assistants')).json()) as Envelope<Array<{ id: string }>>)
        .data ?? [];
    const parent = ((await (
      await page.request.post('/api/conversations', {
        data: { assistantId: assistants[0]!.id, title: 'v2.21 上限父会话' },
      })
    ).json()) as Envelope<{ id: string }>).data!;
    let childId = '';
    try {
      const first = ((await (
        await page.request.post(`/api/conversations/${parent.id}/branches`, {
          data: { goal: '第一条分支', autoStart: false },
        })
      ).json()) as Envelope<{ branch: { id: string }; childConversationId: string }>).data!;
      childId = first.childConversationId;
      const second = await page.request.post(`/api/conversations/${parent.id}/branches`, {
        data: { goal: '第二条分支', autoStart: false },
      });
      expect(second.status()).toBe(422);
      expect(await second.text()).toContain('父会话分支数已达上限');
      await page.request.delete(`/api/branches/${first.branch.id}`);
    } finally {
      await page.request.put('/api/settings', { data: { branchMaxChildren: 6 } });
      if (childId) await page.request.delete(`/api/conversations/${childId}`);
      await page.request.delete(`/api/conversations/${parent.id}`);
    }
  });
});
