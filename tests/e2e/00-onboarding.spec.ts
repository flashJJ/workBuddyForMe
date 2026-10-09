import { expect, test } from '@playwright/test';

/**
 * v1.2 M5 首启向导 / 快捷键浮层 / 帮助中心 e2e。
 * 文件名 00- 前缀：web e2e 串行（workers:1）共享一个全新临时数据根，
 * 本用例最先执行并落 hasOnboarded=1，后续 spec 不再被向导遮罩拦截。
 */
test.describe('M5 首启体验', () => {
  test('全新数据根自动弹向导，走完全程后写入 hasOnboarded，不再重弹', async ({ page }) => {
    // 显式复位为首启态：全新临时库本就 false；复用旧 dev server 时也能确定性复现
    await page.request.put('/api/settings', { data: { hasOnboarded: false } });
    await page.goto('/chat');

    // 自动门控：未引导用户进主区即弹全屏模态
    const dialog = page.getByTestId('onboarding-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('onboarding-welcome')).toBeVisible();

    // 供应商步可跳过（不强制配置）；切一下 Ollama 页签确认渲染
    await page.getByTestId('ob-next').click();
    await expect(page.getByTestId('onboarding-provider')).toBeVisible();
    await page.getByTestId('ob-tab-ollama').click();
    await expect(page.getByTestId('ob-ollama-detect')).toBeVisible();
    await page.getByTestId('ob-tab-cloud').click();
    await expect(page.getByTestId('onboarding-cloud')).toBeVisible();

    // 语音步 → 完成步 → 进入应用
    await page.getByTestId('ob-next').click();
    await expect(page.getByTestId('onboarding-voice')).toBeVisible();
    await page.getByTestId('ob-next').click();
    await expect(page.getByTestId('onboarding-finish')).toBeVisible();
    await page.getByTestId('ob-enter').click();
    await expect(dialog).toBeHidden();

    // 设置已落盘
    const settings = await page.request.get('/api/settings');
    const body = (await settings.json()) as { data: { hasOnboarded: boolean } };
    expect(body.data.hasOnboarded).toBe(true);

    // 刷新不再自动弹
    await page.reload();
    await expect(dialog).toBeHidden();
  });

  test('关于面板可重放向导；Ctrl+/ 唤起快捷键浮层；帮助锚点可达', async ({ page }) => {
    await page.goto('/settings');

    // 重放向导（关于面板在纯浏览器走无桥分支，快捷入口仍在）
    await page.getByTestId('about-replay-wizard').click();
    const dialog = page.getByTestId('onboarding-dialog');
    await expect(dialog).toBeVisible();
    await page.getByTestId('ob-skip').click();
    await expect(dialog).toBeHidden();

    // Ctrl+/ 快捷键浮层
    await page.keyboard.press('Control+/');
    const overlay = page.getByTestId('shortcuts-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.getByText('Ctrl + K')).toBeVisible();
    await expect(overlay.getByText('Ctrl + Alt + Esc')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();

    // 关于面板「帮助与常见问题」锚点跳转
    await page.getByTestId('about-help').click();
    await expect(page).toHaveURL(/#help-center$/);
    const help = page.getByTestId('help-center');
    await expect(help).toBeVisible();
    // 10 条 FAQ 锚点
    await expect(help.locator('article')).toHaveCount(10);
    await expect(page.getByTestId('help-item-ollama')).toContainText('11434');
    await expect(page.getByTestId('help-item-shortcuts')).toContainText('Ctrl + K');
  });
});
