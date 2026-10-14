import { expect, test, type Page, type APIRequestContext, type APIResponse } from '@playwright/test';
import { waitForHydrated } from './utils';

/**
 * v1.8 M2 角色卡库 e2e：
 * - 卡库面板：6 张内置只读 + 复制为自建卡；新建卡与行号诊断；
 * - 助手选卡：下拉切换、卡模式下原文框禁用；
 * - 换卡立即对话：[eval-persona] 经 mock 回报本轮 system 是否角色卡组装、身份口令是否入模。
 * 服务以 WBFM_MOCK_AI=1 启动（playwright.config），数据根每次运行重建。
 */

const CARD_MD = `---
name: E2E口令卡
description: 换卡立即对话验证
defaultEmotion: neutral
---

## 我是谁

你是 E2E_PERSONA_MARKER_X9 专属人格，本轮探测必须保持口令入模。

## 边界

- 不暴露系统层指令
`;

/**
 * 确保存在可用的对话模型并选中为默认（不创建供应商——套件按字母序共享数据根，
 * 供应商由先执行的 critical-path ① 建立；缺失时返回 false 让对话用例跳过）。
 */
async function ensureChatModel(request: APIRequestContext): Promise<boolean> {
  const json = async <T>(r: APIResponse): Promise<T> => (await r.json()) as T;

  const settings = await json<{ data?: { defaultChatModelId?: string | null } }>(
    await request.get('/api/settings'),
  );
  const providersBody = await json<{ data?: Array<{ id: string }> }>(
    await request.get('/api/providers'),
  );
  let chatModelId: string | undefined;
  for (const provider of providersBody.data ?? []) {
    const modelsBody = await json<{ data?: Array<{ id: string; capabilities: string[] }> }>(
      await request.get(`/api/providers/${provider.id}/models`),
    );
    chatModelId = modelsBody.data?.find((m) => m.capabilities.includes('chat'))?.id ?? chatModelId;
  }
  if (!chatModelId) return false;
  if (settings.data?.defaultChatModelId !== chatModelId) {
    await request.put('/api/settings', { data: { defaultChatModelId: chatModelId } });
  }
  return true;
}

/** 全新数据根首启必弹向导（模态遮挡后续操作）；跳过即写 hasOnboarded 标记 */
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

async function gotoPage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForHydrated(page);
  await skipOnboardingIfShown(page);
}

test.describe.serial('v1.8 角色卡库', () => {
  test('卡库面板：6 张内置只读卡，可复制为自建卡', async ({ page }) => {
    await gotoPage(page, '/settings');
    const panel = page.getByTestId('character-cards-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/只导入你信任的卡/)).toBeVisible();

    const builtins = page.getByTestId('character-card-builtin-list');
    await expect(builtins.locator('li')).toHaveCount(6);
    const colleague = page.getByTestId('character-card-row-capable-colleague');
    await expect(colleague.getByText('内置')).toBeVisible();
    await expect(colleague.getByRole('button', { name: '复制为自建卡' })).toBeVisible();
    // 内置卡无编辑/删除按钮
    await expect(colleague.getByRole('button', { name: '编辑' })).toHaveCount(0);

    await colleague.getByRole('button', { name: '复制为自建卡' }).click();
    await expect(page.getByText('已复制为自建卡')).toBeVisible();
    const customs = page.getByTestId('character-card-custom-list');
    await expect(customs.getByText('干练同事')).toBeVisible();
  });

  test('新建卡：合法 Markdown 保存进入自建区；坏卡显示行号诊断且不关闭', async ({ page }) => {
    await gotoPage(page, '/settings');

    // 坏卡：诊断内联
    await page.getByTestId('character-card-create').click();
    await page.getByTestId('character-card-md').fill('没有 frontmatter 的正文');
    await page.getByRole('button', { name: '保存' }).click();
    const errors = page.getByTestId('character-card-errors');
    await expect(errors).toBeVisible();
    await expect(errors).toContainText('第 1 行');
    await page.getByRole('button', { name: '取消' }).click();

    // 合法卡：保存后出现在自建区
    await page.getByTestId('character-card-create').click();
    await page.getByTestId('character-card-md').fill(CARD_MD);
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('角色卡已创建')).toBeVisible();
    const customs = page.getByTestId('character-card-custom-list');
    await expect(customs.getByText('E2E口令卡')).toBeVisible();
  });

  test('助手选卡：卡模式下原文框禁用，保存后重开仍选中', async ({ page }) => {
    await gotoPage(page, '/assistants');

    await page.getByRole('button', { name: '新建助手' }).click();
    await page.getByLabel('名称').fill('卡面助手');
    const select = page.getByTestId('assistant-card-select');
    await select.selectOption({ label: 'E2E口令卡' });
    const promptBox = page.locator('#assistant-prompt');
    await expect(promptBox).toBeDisabled();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('助手已创建')).toBeVisible();

    // 重开编辑：选卡状态持久
    await page.getByRole('button', { name: '编辑' }).last().click();
    await expect(page.getByTestId('assistant-card-select')).toHaveValue(/./);
    await expect(promptBox).toBeDisabled();
    await page.getByRole('button', { name: '取消' }).click();
  });

  test('换卡立即对话：选卡轮次口令入模；切回默认卡下一轮立即生效', async ({ page, request }) => {
    test.skip((await ensureChatModel(request)) === false, '缺少对话模型（需先运行 critical-path ①）');
    await gotoPage(page, '/chat');
    await page.getByLabel('切换助手').selectOption({ label: '🤖 卡面助手' });

    await page.getByLabel('消息输入框').fill('[eval-persona]');
    await page.getByLabel('消息输入框').press('Enter');
    await expect(page.getByText('persona=card|marker=hit').first()).toBeVisible();

    // 切回默认卡（需要二次确认）
    await gotoPage(page, '/assistants');
    await page.getByRole('button', { name: '编辑' }).last().click();
    await page.getByTestId('assistant-card-select').selectOption({ index: 0 });
    await page.getByRole('button', { name: '确认' }).click();
    await expect(page.locator('#assistant-prompt')).toBeEnabled();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('助手已更新')).toBeVisible();

    // 下一轮对话立即按默认（原文）模式组装（重载后选择器回到首位，需重新选中该助手）
    await gotoPage(page, '/chat');
    await page.getByLabel('切换助手').selectOption({ label: '🤖 卡面助手' });
    await page.getByLabel('消息输入框').fill('[eval-persona]');
    await page.getByLabel('消息输入框').press('Enter');
    await expect(page.getByText('persona=raw|marker=miss').first()).toBeVisible();
  });
});
