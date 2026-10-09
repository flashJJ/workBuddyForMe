import { expect, test } from '@playwright/test';

test.describe('i18n 语言切换（v1.2 M4）', () => {
  // 前序 spec 异常可能留下 en-US（如本用例中途失败），入口先复位为中文保证可重入
  test.beforeAll(async ({ request }) => {
    await request.put('/api/settings', { data: { language: 'zh-CN' } });
  });

  test('设置页切英文即时生效，导航/命令面板英文化，刷新后保持', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: '新增供应商' })).toBeVisible();

    // 中文默认：导航与跳过链接为中文
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();

    // 切换 English（原生 select）
    await page.locator('#language-preference').selectOption('en-US');

    // 即时生效，无需刷新（FAQ 锚点 chip 文案可能含 Chat 等词，导航断言用 exact）
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Chat', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Knowledge', exact: true })).toBeVisible();
    await expect(page.locator('header').getByRole('button', { name: 'Add provider' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');

    // 命令面板随语言
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Search and run a command' })).toBeVisible();
    await expect(page.getByRole('listbox', { name: 'Commands' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // 刷新后语言保持（localStorage 缓存 + 服务端设置水合）
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    await expect(page.getByRole('link', { name: 'Chat', exact: true })).toBeVisible();

    // 切回中文
    await page.locator('#language-preference').selectOption('zh-CN');
    await expect(page.getByRole('link', { name: '对话', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  });
});
