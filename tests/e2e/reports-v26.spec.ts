import { expect, test } from '@playwright/test';
import { waitForHydrated } from './utils';

import { resetE2eData } from './reset';

// 文件级隔离：任何 spec 单独/乱序运行都从「刚安装」状态开始（见 reset.ts）
test.beforeAll(async ({ request }) => {
  await resetE2eData(request);
});

/** v2.6 M5 P1-2：运行报告页与导出链路（空窗口也应可导出）。 */
test.describe.serial('v2.6 运行报告', () => {
  test('页面渲染、链路筛选与 Markdown 导出', async ({ page }) => {
    await page.goto('/reports');
    await waitForHydrated(page);

    await expect(page.getByTestId('run-report-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: '运行报告' })).toBeVisible();
    await expect(page.getByLabel('开始日期')).toBeVisible();
    await expect(page.getByLabel('结束日期')).toBeVisible();
    await expect(page.getByLabel('链路筛选')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('run-report-export-md').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^run-report-\d{4}-\d{2}-\d{2}_.*\.md$/);
  });
});
