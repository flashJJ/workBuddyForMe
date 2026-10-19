import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { chooseOption, waitForHydrated } from './utils';

/**
 * v1.9 M1 舞台骨架 e2e（mock cast 可演）：
 * - /stage 独立全屏路由，三槽角色/聚焦/台词/表情；
 * - 省电档：仅聚焦槽 live，其余立绘槽；
 * - H 隐 UI、Esc 逐级退出（先散焦）；
 * - 场景保存/读取/删除走真实 API；
 * - 浏览器无舞台桥，截图按钮给降级提示。
 */

async function cleanupScene(request: APIRequestContext, name: string): Promise<void> {
  const body = (await request.get('/api/stage-scenes').then((r) => r.json())) as {
    data: Array<{ id: string; name: string }>;
  };
  for (const scene of body.data ?? []) {
    if (scene.name === name) await request.delete(`/api/stage-scenes/${scene.id}`);
  }
}

async function openStage(page: Page): Promise<void> {
  await page.goto('/stage');
  await waitForHydrated(page);
  await expect(page.getByTestId('stage-root')).toBeVisible();
}

test.describe.serial('v1.9 M1 舞台骨架（mock cast）', () => {
  test.beforeAll(async ({ request }) => {
    // 单跑本文件时没有 00-onboarding 前置，直接落 hasOnboarded 避免向导遮罩
    await request.put('/api/settings', { data: { hasOnboarded: true } });
    await cleanupScene(request, 'e2e 舞台场景');
  });
  test.afterAll(async ({ request }) => {
    await cleanupScene(request, 'e2e 舞台场景');
  });

  test('三槽就位：默认聚焦中槽，名字牌渲染', async ({ page }) => {
    await openStage(page);
    for (const slot of ['left', 'center', 'right'] as const) {
      await expect(page.getByTestId(`stage-actor-${slot}`)).toBeVisible();
      await expect(page.getByTestId(`stage-nameplate-${slot}`)).toContainText(
        slot === 'left' ? '规划' : slot === 'center' ? '执行' : '审查',
      );
    }
    await expect(page.getByTestId('stage-actor-center')).toHaveAttribute('data-focused', 'true');
  });

  test('演示控制：轮换聚焦、台词进对话框、表情轮换、散焦', async ({ page }) => {
    await openStage(page);
    await page.getByTestId('stage-demo-next').click();
    await expect(page.getByTestId('stage-actor-right')).toHaveAttribute('data-focused', 'true');

    await page.getByTestId('stage-demo-say').click();
    await expect(page.getByTestId('stage-dialog')).toContainText('审查结果我看过了');

    await page.getByTestId('stage-demo-next').click(); // 回到左
    await expect(page.getByTestId('stage-actor-left')).toHaveAttribute('data-focused', 'true');
    await page.getByTestId('stage-demo-expr').click();
    // 左槽经上一步轮换聚焦已置 joy（开心），再轮换按 joy→sadness→anger 推进
    await expect(page.getByTestId('stage-nameplate-left')).toContainText('难过');
    await page.getByTestId('stage-demo-expr').click();
    await expect(page.getByTestId('stage-nameplate-left')).toContainText('生气');

    await page.getByTestId('stage-demo-defocus').click();
    await expect(page.getByTestId('stage-actor-left')).toHaveAttribute('data-focused', 'false');
    await expect(page.getByTestId('stage-dialog')).toBeHidden();
  });

  test('省电档：仅聚焦槽 live，其余立绘槽', async ({ page }) => {
    await openStage(page);
    // 全 Live2D：三槽 data-live=true
    for (const slot of ['left', 'center', 'right'] as const) {
      await expect(page.getByTestId(`stage-actor-${slot}`)).toHaveAttribute('data-live', 'true');
    }

    // 省电档（stage.power.portrait）：点触发器 → 按文案选
    await chooseOption(page, page.getByTestId('stage-power-mode'), '省电档（仅发言者 Live2D）');
    await expect(page.getByTestId('stage-actor-center')).toHaveAttribute('data-live', 'true');
    await expect(page.getByTestId('stage-actor-left')).toHaveAttribute('data-live', 'false');
    await expect(page.getByTestId('stage-actor-right')).toHaveAttribute('data-live', 'false');
    await expect(page.getByTestId('stage-portrait-left')).toBeVisible();
    await expect(page.getByTestId('stage-portrait-right')).toBeVisible();
    // 切回全 live（stage.power.live）恢复
    await chooseOption(page, page.getByTestId('stage-power-mode'), '全 Live2D（高性能）');
    await expect(page.getByTestId('stage-actor-left')).toHaveAttribute('data-live', 'true');
  });

  test('H 隐藏界面；Esc 先散焦再退出（浏览器回落 /chat）', async ({ page }) => {
    await openStage(page);
    await page.keyboard.press('h');
    await expect(page.getByTestId('stage-chrome')).toHaveAttribute('data-visible', 'false');
    await page.keyboard.press('h');
    await expect(page.getByTestId('stage-chrome')).toHaveAttribute('data-visible', 'true');

    // 当前中槽聚焦：第一次 Esc 散焦，第二次退出
    await expect(page.getByTestId('stage-actor-center')).toHaveAttribute('data-focused', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('stage-actor-center')).toHaveAttribute('data-focused', 'false');
    await expect(page.getByTestId('stage-root')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/chat$/);
  });

  test('场景保存/读取/删除走真实 API', async ({ page, request }) => {
    await openStage(page);
    // 改背景为纯蓝（stage.bg.solid），保存命名场景
    await chooseOption(page, page.getByLabel('背景类型'), '纯色');
    await page.locator('input[type="color"]').first().fill('#123abc');
    await page.getByLabel('场景名称').fill('e2e 舞台场景');
    await page.getByTestId('stage-scene-save').click();
    await expect(page.getByText('场景已保存')).toBeVisible();

    // 直接读 API 确认落库且 payload 带改色
    const body = (await request.get('/api/stage-scenes').then((r) => r.json())) as {
      data: Array<{ id: string; name: string; payload: { background: { color?: string } } }>;
    };
    const saved = body.data.find((s) => s.name === 'e2e 舞台场景');
    expect(saved?.payload.background.color?.toLowerCase()).toBe('#123abc');

    // 改回默认背景（stage.bg.builtinLabel）后从下拉读取，颜色被还原
    await chooseOption(page, page.getByLabel('背景类型'), '内置预设');
    await page.getByLabel('场景名称').fill('');
    // Radix 对「重选已选中项」不触发 onValueChange（useControllableState 同值短路），
    // 保存后该场景已在读档下拉中选中，先切回空项再选场景，确保 load 被调用
    await chooseOption(page, page.getByLabel('读取场景'), '（未保存场景）');
    // 选项文案即场景名（option value 为 saved.id）
    await chooseOption(page, page.getByLabel('读取场景'), 'e2e 舞台场景');
    await expect(page.locator('input[type="color"]').first()).toHaveValue('#123abc');
  });

  test('浏览器无舞台桥：截图按钮给降级提示而非报错', async ({ page }) => {
    await openStage(page);
    await page.getByTestId('stage-screenshot').click();
    await expect(page.getByText('截图需在桌面端舞台窗口使用')).toBeVisible();
  });
});
