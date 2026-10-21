import { expect, test } from '@playwright/test';
import { waitForHydrated } from './utils';

/**
 * v2.4 M5 / P1-3：命令面板覆盖高频动作。
 * 导航（任务/工作流）+ 新建（知识库/工作流/助手/角色卡）必须可用；
 * 新建命令走 ?new= 深链接，进入页面即打开创建表单。
 */
test.describe('v2.4 命令面板覆盖与新建深链接', () => {
  test.beforeAll(async ({ request }) => {
    await request.put('/api/settings', { data: { hasOnboarded: true } });
  });

  test('命令面板含任务/工作流导航与四类新建命令', async ({ page }) => {
    await page.goto('/chat');
    await waitForHydrated(page);
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('command-input')).toBeVisible();

    for (const id of ['nav:tasks', 'nav:flows', 'kb:new', 'flow:new', 'assistant:new', 'card:new']) {
      await expect(page.getByTestId(`command-item-${id}`)).toBeVisible();
    }
  });

  test('Ctrl+K 搜索「新建知识库」并回车，直达创建表单', async ({ page }) => {
    await page.goto('/chat');
    await waitForHydrated(page);
    await page.keyboard.press('Control+k');
    await page.getByTestId('command-input').fill('新建知识库');
    await expect(page.getByTestId('command-item-kb:new')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: '新建知识库' })).toBeVisible();
  });

  test('新建工作流深链接（/flows?new=1）直接打开创建表单', async ({ page }) => {
    await page.goto('/flows?new=1');
    await waitForHydrated(page);
    await expect(page.getByRole('heading', { name: '新建工作流' })).toBeVisible();
  });

  test('新建助手深链接（/assistants?new=1）直接打开创建表单', async ({ page }) => {
    await page.goto('/assistants?new=1');
    await waitForHydrated(page);
    await expect(page.getByRole('heading', { name: '新建助手' })).toBeVisible();
  });

  test('新建角色卡深链接（/settings?new=card）直接打开编辑器', async ({ page }) => {
    await page.goto('/settings?new=card#setting-data');
    await waitForHydrated(page);
    await expect(page.getByRole('heading', { name: '新建角色卡' })).toBeVisible();
  });
});
