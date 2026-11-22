import { expect, test } from '@playwright/test';
import { revealSettingsSection, waitForHydrated } from './utils';
import { resetE2eData } from './reset';

/**
 * v4.21 M5：记忆治理与解释面板。
 * - 固定/取消固定幂等；
 * - 降权后重要性回显变化；
 * - 合并后来源归档；
 * - 导出 Markdown 文件名正确。
 */

const FIRST = 'v421 用户住在杭州';
const SECOND = 'v421 用户在上海工作';

test.beforeAll(async ({ request }) => {
  await resetE2eData(request);
  await request.put('/api/settings', { data: { hasOnboarded: true } });
  for (const content of [FIRST, SECOND]) {
    const created = await request.post('/api/memories', {
      data: { kind: 'fact', content, importance: 0.5 },
    });
    expect(created.ok(), `创建记忆失败：${created.status()}`).toBeTruthy();
  }
  // 先确认写入落库：若这里失败是服务端问题，否则才是页面可见性门控问题
  const listed = await request.get('/api/memories');
  expect(listed.ok()).toBeTruthy();
  const body = (await listed.json()) as { data: Array<{ content: string }> };
  const contents = body.data.map((memory) => memory.content);
  expect(contents).toEqual(expect.arrayContaining([FIRST, SECOND]));
});

test('v4.21 固定、降权、合并与导出', async ({ page }) => {
  await page.goto('/settings');
  await waitForHydrated(page);
  // 记忆面板的查询由可见性门控触发：先把所在分组与面板滚入视口
  await revealSettingsSection(page, 'data');
  const panel = page.getByTestId('memory-panel');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await panel.scrollIntoViewIfNeeded({ timeout: 10_000 });
  }).toPass({ timeout: 30_000 });

  const firstRow = page.locator('[data-testid="memory-item"]').filter({ hasText: FIRST });
  const secondRow = page.locator('[data-testid="memory-item"]').filter({ hasText: SECOND });
  await expect(firstRow).toBeVisible();
  await expect(secondRow).toBeVisible();

  // 固定 → 取消固定（撤销回滚）
  await firstRow.getByTestId('memory-pin').click();
  await expect(firstRow.getByTestId('memory-pin')).toHaveText('取消固定');
  await expect(firstRow.getByText('置顶')).toBeVisible();
  await firstRow.getByTestId('memory-pin').click();
  await expect(firstRow.getByTestId('memory-pin')).toHaveText('固定');
  await expect(firstRow.getByText('置顶')).toHaveCount(0);

  // 降权两次：0.5 → 0.3
  await secondRow.getByTestId('memory-downweight').click();
  await expect(secondRow.getByText('重要性 0.4')).toBeVisible();
  await secondRow.getByTestId('memory-downweight').click();
  await expect(secondRow.getByText('重要性 0.3')).toBeVisible();

  // 合并：把第二条并入第一条，来源归档
  await firstRow.getByTestId('memory-merge').click();
  const dialog = page.getByTestId('memory-merge-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('checkbox').first().check();
  await page.getByTestId('memory-merge-confirm').click();
  await expect(dialog).toBeHidden();
  await expect(secondRow.getByText('已归档')).toBeVisible();

  // 导出 Markdown
  await page.getByTestId('memory-export').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('memory-export-markdown').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^memories-\d{8}\.md$/);

  // 解释面板存在（召回轨迹为只读元数据）
  await expect(page.getByTestId('memory-recall-trace')).toBeVisible();
});
