import { expect, test, type Page } from '@playwright/test';

/**
 * v1.6 情绪与互动设置（M4 面板 + M5 互动短句开关）。
 * 设置走真实 API；结束后恢复两个开关，避免污染同轮后续 spec。
 */

/** 全新数据根首启必弹向导（模态遮挡后续操作）；跳过即写 hasOnboarded 标记 */
async function skipOnboardingIfShown(page: Page): Promise<void> {
  const wizard = page.getByRole('dialog', { name: '首次使用向导' });
  try {
    await wizard.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    return; // 已标记首启完成，向导未弹出
  }
  await page.getByRole('button', { name: '跳过' }).click();
  await expect(wizard).toBeHidden();
}

test.describe.serial('v1.6 情绪与互动设置', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await skipOnboardingIfShown(page);
    await expect(page.getByTestId('emotion-panel')).toBeVisible();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/settings');
    await skipOnboardingIfShown(page);
    // 先恢复总开关（子开关仅在总开关开启时挂载），再恢复短句开关
    const master = page.getByTestId('emotion-enabled-toggle');
    await master.check({ force: true }).catch(() => {});
    await page.getByTestId('emotion-lines-toggle').check({ force: true }).catch(() => {});
    await page.close();
  });

  test('面板与两个开关默认态、状态区与事件区渲染', async ({ page }) => {
    await expect(page.getByTestId('emotion-enabled-toggle')).toBeChecked();
    await expect(page.getByTestId('emotion-lines-toggle')).toBeChecked();
    await expect(page.getByTestId('emotion-detail')).toBeVisible();
  });

  test('互动短句开关：取消后持久化，重载仍为关闭', async ({ page }) => {
    await page.getByTestId('emotion-lines-toggle').uncheck();
    await expect(page.getByTestId('emotion-lines-toggle')).not.toBeChecked();

    await page.reload();
    await skipOnboardingIfShown(page);
    await expect(page.getByTestId('emotion-panel')).toBeVisible();
    await expect(page.getByTestId('emotion-lines-toggle')).not.toBeChecked();
    // 情绪总开关不受影响，状态区仍在
    await expect(page.getByTestId('emotion-enabled-toggle')).toBeChecked();
    await expect(page.getByTestId('emotion-detail')).toBeVisible();
  });

  test('情绪总开关关闭：短句开关与状态区一并隐藏；重开后恢复', async ({ page }) => {
    await page.getByTestId('emotion-enabled-toggle').uncheck();
    await expect(page.getByTestId('emotion-lines-toggle')).toHaveCount(0);
    await expect(page.getByTestId('emotion-detail')).toHaveCount(0);

    await page.getByTestId('emotion-enabled-toggle').check();
    await expect(page.getByTestId('emotion-lines-toggle')).toBeVisible();
    await expect(page.getByTestId('emotion-detail')).toBeVisible();
  });
});
