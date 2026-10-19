import { expect, test, type Page } from '@playwright/test';
import { chooseOptionByIndex, waitForHydrated } from './utils';

/**
 * v1.7 M5 剧情演出设置抽测：
 * - 面板默认态（总开关/三档/20 剧本（v2.0：3 等级 + 6 里程碑 + 3 主动感知）/自定义区块/统计区）；
 * - 自定义短语规则新建→持久化→删除全链路（真实 API）；
 * - 打扰率统计：选助手后渲染三指标与无数据文案。
 * 全新临时数据根，无跨文件污染；规则在创建用例末尾自删。
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

async function gotoSettings(page: Page): Promise<void> {
  await page.goto('/settings');
  await waitForHydrated(page);
  await skipOnboardingIfShown(page);
  await expect(page.getByTestId('event-panel')).toBeVisible();
}

test.describe.serial('v1.7 剧情演出与自定义短语（M5）', () => {
  test('面板默认态：总开关开、标准档、20 剧本开关、自定义与统计区块可见', async ({ page }) => {
    await gotoSettings(page);
    await expect(page.getByTestId('event-enabled-toggle')).toBeChecked();
    await expect(page.getByTestId('event-tier-standard')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId(/^event-scene-toggle-/)).toHaveCount(20);
    await expect(page.getByTestId('custom-trigger-section')).toBeVisible();
    await expect(page.getByTestId('custom-trigger-empty')).toBeVisible();
    await expect(page.getByTestId('event-usage-stats')).toBeVisible();
  });

  test('总开关关闭：子区块隐藏；重开后恢复且持久化默认开', async ({ page }) => {
    await gotoSettings(page);
    await page.getByTestId('event-enabled-toggle').uncheck();
    await expect(page.getByTestId('custom-trigger-section')).toHaveCount(0);
    await expect(page.getByTestId('event-usage-stats')).toHaveCount(0);

    await page.getByTestId('event-enabled-toggle').check();
    await expect(page.getByTestId('custom-trigger-section')).toBeVisible();
    await expect(page.getByTestId('event-usage-stats')).toBeVisible();
  });

  test('自定义规则：新建→重载持久化→删除全链路', async ({ page }) => {
    await gotoSettings(page);

    await page.getByTestId('custom-trigger-add').click();
    const form = page.getByTestId('custom-trigger-form');
    await expect(form).toBeVisible();

    // 归属助手（首个真实选项，index 0 为禁用的占位项）+ 两条短语；剧本保持默认
    await chooseOptionByIndex(page, page.getByTestId('custom-trigger-assistant'), 1);
    await page.getByTestId('custom-trigger-phrases').fill('夸夸我\n辛苦了');
    await page.getByRole('button', { name: '保存' }).click();

    await expect(form).toBeHidden();
    const row = page.getByTestId(/^custom-trigger-row-/);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('「夸夸我」');
    await expect(row).toContainText('「辛苦了」');
    await expect(page.getByTestId('custom-trigger-empty')).toHaveCount(0);

    // 重载后仍在（真实落库验证）
    await page.reload();
    await waitForHydrated(page);
    await expect(page.getByTestId(/^custom-trigger-row-/)).toHaveCount(1);
    await expect(page.getByTestId(/^custom-trigger-row-/)).toContainText('「夸夸我」');

    // 启停：取消勾选后持久化为停用
    // 乐观 UI 会立即回弹为未选中，必须等 PATCH 落库后再 reload，
    // 否则 reload 会中止在途请求，服务端仍为启用态
    const disablePatch = page.waitForResponse(
      (r) => r.url().includes('/api/event-triggers/') && r.request().method() === 'PATCH' && r.ok(),
    );
    await page.getByRole('checkbox', { name: '启用该规则' }).uncheck();
    await disablePatch;
    await page.reload();
    await waitForHydrated(page);
    await expect(page.getByRole('checkbox', { name: '启用该规则' })).not.toBeChecked();

    // 删除：回到空态（设置页存在多个「删除」按钮，限定到规则行）
    await page
      .getByTestId(/^custom-trigger-row-/)
      .getByRole('button', { name: '删除' })
      .click();
    await expect(page.getByTestId(/^custom-trigger-row-/)).toHaveCount(0);
    await expect(page.getByTestId('custom-trigger-empty')).toBeVisible();
  });

  test('打扰率统计：选择助手后展示三指标与无数据文案', async ({ page }) => {
    await gotoSettings(page);
    // 首个真实助手（index 0 为禁用的占位项）
    await chooseOptionByIndex(page, page.getByTestId('event-usage-assistant'), 1);
    await expect(page.getByText('这段时间还没有演出记录。')).toBeVisible();
    // 空库下完整演出为 0，比率无数据显示 —
    await expect(page.getByTestId('event-usage-stats')).toContainText('0');
    await expect(page.getByTestId('event-usage-downgrade-hint')).toHaveCount(0);
  });
});
