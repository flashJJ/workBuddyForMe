import { expect, test, type Page } from '@playwright/test';
import { waitForHydrated } from './utils';

/**
 * v2.4 P0-2（M2）· 模板可触达 e2e。
 * 覆盖验收 A1（空态/入口露出模板卡）、A2（以此开始产出实例）、A3（内置来源徽标）、
 * A4（卡片数 == 接口返回的内置条目数，不硬编码）。
 *
 * 本条会新建临时实例；用例末尾用 API 清理，避免污染共享数据根（后续 spec 依赖助手顺序等）。
 */

const KB_TEMPLATE_ID = 'c0000000-0000-4000-8000-000000000001';
const RESEARCH_KB_ID = 'c0000000-0000-4000-8000-000000000003';
const FLOW_TEMPLATE_ID = 'b0000001-0000-4000-8000-000000000001';

async function apiList<T>(page: Page, path: string): Promise<T[]> {
  const res = await page.request.get(path);
  const body = (await res.json()) as { data: T[] };
  return body.data;
}

/** 按名称删掉本次用例新建的实例（清理用） */
async function deleteByName(
  page: Page,
  listPath: string,
  itemPath: (id: string) => string,
  name: string,
): Promise<void> {
  const items = await apiList<{ id: string; name: string }>(page, listPath);
  const hit = items.find((item) => item.name === name);
  if (hit) await page.request.delete(itemPath(hit.id));
}

test.describe('v2.4 模板可触达', () => {
  // 首启向导是模态遮挡：先把 hasOnboarded 置位，保证本 spec 可单独运行（全量跑时早已置位）
  test.beforeEach(async ({ page }) => {
    await page.request.put('/api/settings', { data: { hasOnboarded: true } });
  });

  test('知识库：侧栏入口露出内置模板，以此开始复制为自建库', async ({ page }) => {
    await page.goto('/knowledge');
    await waitForHydrated(page);

    // 列表顶部常驻可折叠入口（D4）
    const launcher = page.getByTestId('kb-template-launcher');
    await expect(launcher).toBeVisible();
    await launcher.getByTestId('kb-template-launcher-toggle').click();
    const gallery = page.getByTestId('kb-template-side');
    await expect(gallery).toBeVisible();

    // A4：卡片数 == 接口返回的内置知识库数（不硬编码）
    const kbs = await apiList<{ id: string }>(page, '/api/knowledge-bases');
    const builtinCount = kbs.filter((kb) => kb.id.startsWith('c0000000-')).length;
    await expect(gallery.locator('li')).toHaveCount(builtinCount);
    // A3：来源徽标 + 推荐先用
    await expect(gallery.getByText('内置')).toHaveCount(builtinCount);
    await expect(gallery.getByText('推荐先用')).toHaveCount(1);

    // A2：以此开始 → 复制为自建库，可打开（侧栏出现且可选中）
    await page
      .getByTestId(`kb-template-side-card-${KB_TEMPLATE_ID}`)
      .getByRole('button', { name: '以此开始' })
      .click();
    await expect(page.getByText(/已复制「产品需求」/)).toBeVisible();
    const clone = page.getByRole('button', { name: /产品需求 副本/ }).first();
    await expect(clone).toBeVisible();
    await clone.click();
    await expect(page.getByRole('heading', { name: '产品需求 副本' })).toBeVisible();

    await deleteByName(page, '/api/knowledge-bases', (id) => `/api/knowledge-bases/${id}`, '产品需求 副本');
  });

  test('工作流：以此开始复制草稿并保留节点图', async ({ page }) => {
    await page.goto('/flows');
    await waitForHydrated(page);

    const launcher = page.getByTestId('flow-template-launcher');
    await expect(launcher).toBeVisible();
    await launcher.getByTestId('flow-template-launcher-toggle').click();
    const gallery = page.getByTestId('flow-template-side');
    await expect(gallery).toBeVisible();

    const flows = await apiList<{ id: string }>(page, '/api/flows');
    await expect(gallery.locator('li')).toHaveCount(flows.filter((f) => f.id.startsWith('b000000')).length);
    await expect(gallery.getByText('推荐先用')).toHaveCount(1);

    await page
      .getByTestId(`flow-template-side-card-${FLOW_TEMPLATE_ID}`)
      .getByRole('button', { name: '以此开始' })
      .click();
    await expect(page.getByText(/已复制「资料研究助手」/)).toBeVisible();

    // A2：副本可打开——列表出现且已带版本图（草稿 v1）
    await expect(page.getByText('资料研究助手 副本').first()).toBeVisible();
    await expect
      .poll(async () => {
        const list = await apiList<{ name: string; currentVersion: number }>(page, '/api/flows');
        return list.find((f) => f.name === '资料研究助手 副本')?.currentVersion ?? 0;
      })
      .toBeGreaterThan(0);

    await deleteByName(page, '/api/flows', (id) => `/api/flows/${id}`, '资料研究助手 副本');
  });

  test('技能：模板入口一键启用（先停用再启用）', async ({ page }) => {
    await page.goto('/settings');
    await waitForHydrated(page);

    const panel = page.getByTestId('skills-panel');
    await expect(panel).toBeVisible();
    const row = panel.getByTestId('skill-item').filter({ hasText: 'weekly-report' }).first();

    // 内置技能来源徽标可见
    await expect(row.getByText('内置', { exact: true })).toBeVisible();

    // 先停用，验证模板入口的「启用」能把它重新打开
    const box = row.getByRole('checkbox');
    await expect(box).toBeChecked();
    await box.click();
    await expect(row.getByRole('checkbox')).not.toBeChecked();

    await panel.getByTestId('skill-template-launcher-toggle').click();
    await page
      .getByTestId('skill-template-card-weekly-report')
      .getByRole('button', { name: '启用' })
      .click();
    await expect(page.getByText(/已启用「weekly-report 周报生成」/)).toBeVisible();
    await expect(row.getByRole('checkbox')).toBeChecked();
  });

  test('助手：以此开始预填新建表单（角色卡 + 知识库）并可保存', async ({ page }) => {
    await page.goto('/assistants');
    await waitForHydrated(page);

    const launcher = page.getByTestId('assistant-template-launcher');
    await expect(launcher).toBeVisible();
    await launcher.getByTestId('assistant-template-launcher-toggle').click();
    const gallery = page.getByTestId('assistant-template');
    await expect(gallery).toBeVisible();
    await expect(gallery.locator('li')).toHaveCount(3);
    // D6：助手预设内部按用途分组
    await expect(gallery.getByText('研究', { exact: true })).toBeVisible();
    await expect(gallery.getByText('办公', { exact: true })).toBeVisible();

    await page
      .getByTestId('assistant-template-card-assistant-research')
      .getByRole('button', { name: '以此开始' })
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('名称')).toHaveValue('资料研究助手');
    // 卡模式生效：预填了角色卡时，提示词原文输入被禁用
    await expect(dialog.getByLabel('系统提示词（人设）')).toBeDisabled();
    await expect(dialog.getByRole('checkbox', { name: '研究资料' })).toBeChecked();

    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('助手已创建')).toBeVisible();
    await expect(page.getByRole('heading', { name: '资料研究助手' })).toBeVisible();

    // A2：产出可用实例——预填的角色卡与知识库随表单落库
    await expect
      .poll(async () => {
        const list = await apiList<{ name: string; cardId: string | null; knowledgeBaseIds: string[] }>(
          page,
          '/api/assistants',
        );
        const made = list.find((item) => item.name === '资料研究助手');
        return made ? `${made.cardId}|${made.knowledgeBaseIds.join(',')}` : 'none';
      })
      .toBe(`research-scout|${RESEARCH_KB_ID}`);

    await deleteByName(page, '/api/assistants', (id) => `/api/assistants/${id}`, '资料研究助手');
  });
});
