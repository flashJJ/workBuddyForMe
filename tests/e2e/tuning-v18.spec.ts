import { expect, test, type Page } from '@playwright/test';
import { waitForHydrated } from './utils';

/**
 * v1.8 M3 调优中心 e2e（依赖同数据根先执行的 critical-path/persona-cards：
 * mock 对话模型、卡面助手与 E2E口令卡均已就绪）：
 * - 上下文条数滑杆：2/50 边界 PUT 落库；
 * - 全局追加：开启+写入后下一轮 system 段可见（append=hit），关闭后下一轮消失（append=miss）。
 *
 * 注意：persona-cards 末例把「卡面助手」切回了原文模式，这里探测前必须重新绑卡。
 */

async function skipOnboardingIfShown(page: Page): Promise<void> {
  const wizard = page.getByRole('dialog', { name: '首次使用向导' });
  if (await wizard.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: '跳过' }).click();
  }
}

async function gotoSettings(page: Page): Promise<void> {
  await page.goto('/settings');
  await waitForHydrated(page);
  await skipOnboardingIfShown(page);
  await expect(page.getByTestId('tuning-panel')).toBeVisible();
}

/** persona-cards 套件结束时卡面助手为原文模式；重新绑定 E2E口令卡（原文→卡无需二次确认） */
async function ensureCardAssistant(page: Page): Promise<void> {
  await page.goto('/assistants');
  await waitForHydrated(page);
  await skipOnboardingIfShown(page);
  await page.getByRole('button', { name: '编辑' }).last().click();
  const select = page.getByTestId('assistant-card-select');
  await expect(select).toBeVisible();
  if ((await select.inputValue()) === '') {
    await select.selectOption({ label: 'E2E口令卡' });
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('助手已更新')).toBeVisible();
  } else {
    await page.getByRole('button', { name: '取消' }).click();
  }
}

test.describe.serial('v1.8 调优中心', () => {
  test('上下文条数：滑到 2 与 50 均 PUT 落库并钳制显示', async ({ page }) => {
    await gotoSettings(page);
    const range = page.getByTestId('tuning-context-range');

    const put2 = page.waitForRequest(
      (r) => r.url().includes('/api/settings') && r.method() === 'PUT' && r.postDataJSON().contextMessageCount === 2,
    );
    await range.fill('2');
    await range.blur();
    await put2;
    await expect(page.getByTestId('tuning-context-value')).toHaveText('2 条');

    const put50 = page.waitForRequest(
      (r) => r.url().includes('/api/settings') && r.method() === 'PUT' && r.postDataJSON().contextMessageCount === 50,
    );
    await range.fill('50');
    await range.blur();
    await put50;
    await expect(page.getByTestId('tuning-context-value')).toHaveText('50 条');
  });

  test('全局追加：开启写入后下一轮入模，关闭后下一轮消失', async ({ page }) => {
    await gotoSettings(page);
    // 恢复条数默认，避免 2 条历史影响后续探测
    await page.getByTestId('tuning-context-range').fill('20');
    await page.getByTestId('tuning-context-range').blur();

    const enabled = page.getByTestId('tuning-append-enabled');
    const enablePut = page.waitForRequest(
      (r) =>
        r.url().includes('/api/settings') && r.method() === 'PUT' && r.postDataJSON().globalAppendPromptEnabled === true,
    );
    await enabled.check();
    await enablePut;

    const text = page.getByTestId('tuning-append-text');
    await text.fill('追加口令 E2E_APPEND_MARKER_Y8，回答保持简洁。');
    const textPut = page.waitForRequest(
      (r) =>
        r.url().includes('/api/settings') &&
        r.method() === 'PUT' &&
        typeof r.postDataJSON().globalAppendPrompt === 'string' &&
        r.postDataJSON().globalAppendPrompt.includes('E2E_APPEND_MARKER_Y8'),
    );
    await text.blur();
    await textPut;

    // persona-cards 末例把卡面助手切回了原文模式，探测前重新绑卡
    await ensureCardAssistant(page);

    // 下一轮对话：身份卡（marker）+ 全局追加（append）同时入模
    await page.goto('/chat');
    await waitForHydrated(page);
    await page.getByLabel('切换助手').selectOption({ label: '🤖 卡面助手' });
    await page.getByLabel('消息输入框').fill('[eval-persona]');
    await page.getByLabel('消息输入框').press('Enter');
    await expect(page.getByText('persona=card|marker=hit|append=hit').first()).toBeVisible();

    // 关闭后下一轮立即消失
    await page.goto('/settings');
    await waitForHydrated(page);
    const disablePut = page.waitForRequest(
      (r) =>
        r.url().includes('/api/settings') && r.method() === 'PUT' && r.postDataJSON().globalAppendPromptEnabled === false,
    );
    await page.getByTestId('tuning-append-enabled').uncheck();
    await disablePut;

    await page.goto('/chat');
    await waitForHydrated(page);
    await page.getByLabel('切换助手').selectOption({ label: '🤖 卡面助手' });
    await page.getByLabel('消息输入框').fill('[eval-persona]');
    await page.getByLabel('消息输入框').press('Enter');
    await expect(page.getByText('persona=card|marker=hit|append=miss').first()).toBeVisible();
  });
});
