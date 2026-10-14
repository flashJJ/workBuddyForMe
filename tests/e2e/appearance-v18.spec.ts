import { expect, test, type Page } from '@playwright/test';
import { waitForHydrated } from './utils';

/**
 * v1.8 M1 外观（命名主题）e2e：
 * - 4 张主题卡渲染且为 radiogroup/radio 语义；
 * - 命名主题切换：html[data-theme] + dark class 立即变化、设置 PUT 落库、重载持久化；
 * - 星际蓝三态（浅/深/系统）按钮仅在 stellar 下出现并可切。
 * 设置走真实 API（e2e 数据根每次运行重建）。
 */

async function gotoSettings(page: Page): Promise<void> {
  await page.goto('/settings');
  await waitForHydrated(page);
  await expect(page.getByTestId('appearance-panel')).toBeVisible();
}

test.describe.serial('v1.8 外观（命名主题）', () => {
  test('面板默认态：4 张主题卡 + radiogroup 语义，星际蓝选中并显示三态', async ({ page }) => {
    await gotoSettings(page);

    const group = page.getByRole('radiogroup').filter({
      has: page.getByTestId('appearance-card-stellar'),
    });
    await expect(group).toBeVisible();
    for (const id of ['stellar', 'nocturne-gold', 'moonwhite', 'sakura']) {
      await expect(page.getByTestId(`appearance-card-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId('appearance-card-stellar')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('appearance-card-nocturne-gold')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    // stellar 下三态可见
    await expect(page.getByTestId('appearance-stellar-modes')).toBeVisible();
  });

  test('切换夜金：data-theme + dark 立即生效、PUT 落库', async ({ page }) => {
    await gotoSettings(page);

    const put = page.waitForResponse(
      (r) => r.url().includes('/api/settings') && r.request().method() === 'PUT',
    );
    await page.getByTestId('appearance-card-nocturne-gold').click();
    await put;

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'nocturne-gold');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByTestId('appearance-card-nocturne-gold')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // 命名主题下星际蓝三态隐藏
    await expect(page.getByTestId('appearance-stellar-modes')).toHaveCount(0);
  });

  test('夜金持久化：重载后仍为夜金，且背景 token 与星际蓝暗色不同', async ({ page }) => {
    await gotoSettings(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'nocturne-gold');
    await expect(page.locator('html')).toHaveClass(/dark/);

    const bg = await page
      .locator('html')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--background').trim());
    // 夜金 30 14% 9%，星际蓝暗色为 222 47% 8%（三元组第一个数即不同）
    expect(bg.startsWith('30 ')).toBe(true);
  });

  test('切樱粉（亮色）再回星际蓝浅色：data-theme/dark 正确翻转', async ({ page }) => {
    await gotoSettings(page);

    await page.getByTestId('appearance-card-sakura').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sakura');
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    // 回星际蓝：卡片 + 三态中的浅色
    await page.getByTestId('appearance-card-stellar').click();
    await page.getByTestId('appearance-mode-light').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'stellar');
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('星际蓝深色三态按钮切换 dark class', async ({ page }) => {
    await gotoSettings(page);
    await page.getByTestId('appearance-mode-dark').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'stellar');
  });
});
