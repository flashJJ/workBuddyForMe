import { expect, test, type Page } from '@playwright/test';
import { chooseOption, revealSettingsSection, waitForHydrated } from './utils';

import { resetE2eData } from './reset';
import { createPersonaCard, createSeededAssistant, ensureMockChatModel } from './seed';

// 文件级隔离：任何 spec 单独/乱序运行都从「刚安装」状态开始（见 reset.ts）
test.beforeAll(async ({ request }) => {
  await resetE2eData(request);
  const { modelId } = await ensureMockChatModel(request, { providerName: 'E2E 调优 Mock' });
  await request.put('/api/settings', { data: { defaultChatModelId: modelId } });
  const card = await createPersonaCard(request);
  await createSeededAssistant(request, { name: '🤖 卡面助手', modelId, cardId: card.id });
});

/**
 * v1.8 M3 调优中心 e2e（文件级重置 + 自行播种，不依赖其他套件的残留数据）：
 * mock 对话模型、卡面助手与 E2E口令卡均已就绪）：
 * - 上下文条数滑杆：2/50 边界 PUT 落库；
 * - 全局追加：开启+写入后下一轮 system 段可见（append=hit），关闭后下一轮消失（append=miss）。
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
  await revealSettingsSection(page, 'tools');
  await expect(page.getByTestId('tuning-panel')).toBeVisible();
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
    // 等响应而非仅等请求发出：后续会跳转页面，在途 PUT 会被导航中止（服务端未落库）
    const enablePut = page.waitForResponse(
      (r) =>
        r.url().includes('/api/settings') &&
        r.request().method() === 'PUT' &&
        r.request().postDataJSON().globalAppendPromptEnabled === true &&
        r.ok(),
    );
    await enabled.check();
    await enablePut;

    const text = page.getByTestId('tuning-append-text');
    await text.fill('追加口令 E2E_APPEND_MARKER_Y8，回答保持简洁。');
    const textPut = page.waitForResponse(
      (r) =>
        r.url().includes('/api/settings') &&
        r.request().method() === 'PUT' &&
        typeof r.request().postDataJSON().globalAppendPrompt === 'string' &&
        r.request().postDataJSON().globalAppendPrompt.includes('E2E_APPEND_MARKER_Y8') &&
        r.ok(),
    );
    await text.blur();
    await textPut;

    // 下一轮对话：身份卡（marker）+ 全局追加（append）同时入模
    await page.goto('/chat');
    await waitForHydrated(page);
    await chooseOption(page, page.getByLabel('切换助手'), '🤖 卡面助手');
    await page.getByLabel('消息输入框').fill('[eval-persona]');
    await page.getByLabel('消息输入框').press('Enter');
    await expect(page.getByText('persona=card|marker=hit|append=hit').first()).toBeVisible();

    // 关闭后下一轮立即消失
    await page.goto('/settings');
    await waitForHydrated(page);
    await revealSettingsSection(page, 'tools');
    const disablePut = page.waitForResponse(
      (r) =>
        r.url().includes('/api/settings') &&
        r.request().method() === 'PUT' &&
        r.request().postDataJSON().globalAppendPromptEnabled === false &&
        r.ok(),
    );
    await page.getByTestId('tuning-append-enabled').uncheck();
    await disablePut;

    await page.goto('/chat');
    await waitForHydrated(page);
    await chooseOption(page, page.getByLabel('切换助手'), '🤖 卡面助手');
    await page.getByLabel('消息输入框').fill('[eval-persona]');
    await page.getByLabel('消息输入框').press('Enter');
    await expect(page.getByText('persona=card|marker=hit|append=miss').first()).toBeVisible();
  });
});
