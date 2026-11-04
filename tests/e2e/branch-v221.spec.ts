import { expect, test, type Page } from '@playwright/test';
import { waitForHydrated } from './utils';

/**
 * v2.21 分支 e2e：
 * - 派生（autoStart=false）→ 顶栏分支面板可见、状态排队、预算视图；
 * - 归档 → 折叠区可见 → 恢复；
 * - 删除（运行中先停的确认路径）后子会话保留；
 * - run-graph?scope=branch 可见分支节点。
 * 不依赖真实模型：分支停在 queued，不发起上游请求。
 */

type Envelope<T> = { data?: T };

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

    // 归档 → 折叠区 → 恢复
    await card.getByRole('button', { name: '归档' }).click();
    await expect(card).toBeHidden();
    await panel.getByText('已归档 (1)').click();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: '恢复' }).click();
    await expect(card).toBeVisible();

    // 删除：确认弹窗后关联移除，子会话保留
    page.once('dialog', (dialog) => void dialog.accept());
    await card.getByRole('button', { name: '删除' }).click();
    await expect(page.getByTestId(`branch-card-${created.branch.id}`)).toHaveCount(0);

    const childRes = await page.request.get(`/api/conversations/${created.childConversationId}`);
    expect(childRes.status()).toBe(200);

    await page.request.delete(`/api/conversations/${created.childConversationId}`);
    await page.request.delete(`/api/conversations/${parent.id}`);
  });
});
