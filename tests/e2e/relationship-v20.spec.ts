import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { waitForHydrated } from './utils';

/**
 * v2.0 M1 关系等级面板 e2e（WBFM_MOCK_AI 数据根）。
 * 等级演算/日上限/检查点由 core 单测保证，本规格只锁 UI 契约：
 * 面板默认态、全新助手=陌生且三档未解锁、开关即时隐藏/重载持久化/恢复。
 * 助手由本文件经 API 自播种并在 afterAll 清理，全量/单跑都确定。
 */

const ASSISTANT_NAME = '关系测试助手';

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

async function seedAssistant(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/assistants', { data: { name: ASSISTANT_NAME } });
  expect(res.ok()).toBeTruthy();
  const payload = (await res.json()) as { success: boolean; data: { id: string } };
  return payload.data.id;
}

async function gotoSettings(page: Page, assistantId: string): Promise<void> {
  await page.goto('/settings');
  await waitForHydrated(page);
  await skipOnboardingIfShown(page);
  await expect(page.getByTestId('relationship-panel')).toBeVisible();
  await page.locator('#relationship-assistant-select').selectOption(assistantId);
  await expect(page.getByTestId('relationship-level-view')).toBeVisible();
}

test.describe.serial('v2.0 关系等级面板', () => {
  let assistantId = '';

  test.beforeAll(async ({ request }) => {
    assistantId = await seedAssistant(request);
  });

  test.afterAll(async ({ browser, request }) => {
    const page = await browser.newPage();
    await page.goto('/settings');
    await waitForHydrated(page);
    await skipOnboardingIfShown(page);
    await page.getByTestId('relationship-enabled-toggle').check({ force: true }).catch(() => {});
    await page.close();
    if (assistantId) {
      await request.delete(`/api/assistants/${assistantId}`);
    }
  });

  test('默认态：开关开；全新助手=陌生、三档未解锁；清单与规则可见', async ({ page }) => {
    await gotoSettings(page, assistantId);
    await expect(page.getByTestId('relationship-enabled-toggle')).toBeChecked();
    await expect(page.getByTestId('relationship-current-level')).toContainText('陌生');
    const rows = page.locator('[data-testid^="relationship-level-row-"]');
    await expect(rows).toHaveCount(3);
    await expect(page.getByTestId('relationship-level-row-1')).toContainText('认识');
    await expect(page.getByTestId('relationship-level-row-2')).toContainText('搭档');
    await expect(page.getByTestId('relationship-level-row-3')).toContainText('挚友');
    await expect(rows.getByText('尚未解锁')).toHaveCount(3);
    const list = page.getByTestId('relationship-unlock-list');
    await expect(list).toContainText('专属称呼');
    await expect(list).toContainText('升级纪念演出');
    // 文案红线：无打卡/KPI 措辞
    const body = await page.getByTestId('relationship-panel').innerText();
    expect(body).not.toContain('还差');
    expect(body).toContain('等级是怎么变化的');
  });

  test('关闭：等级区隐藏；重载持久化；重开恢复', async ({ page }) => {
    await gotoSettings(page, assistantId);
    await page.getByTestId('relationship-enabled-toggle').uncheck();
    await expect(page.getByTestId('relationship-level-view')).toHaveCount(0);
    await expect(page.getByTestId('relationship-assistant-select')).toHaveCount(0);

    await page.reload();
    await waitForHydrated(page);
    await expect(page.getByTestId('relationship-enabled-toggle')).not.toBeChecked();
    await expect(page.getByTestId('relationship-level-view')).toHaveCount(0);

    await page.getByTestId('relationship-enabled-toggle').check();
    await expect(page.getByTestId('relationship-level-view')).toBeVisible();
    await expect(page.locator('[data-testid^="relationship-level-row-"]')).toHaveCount(3);
  });
});
