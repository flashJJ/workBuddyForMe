import { expect, test, type Page } from '@playwright/test';

/**
 * M3 Live2D 形象 e2e：
 * - 形象关闭（默认）：/chat 不挂载形象栏，零 Live2D/Cubism/模型资源请求；
 * - 开启后：对话页出现形象栏，动态 chunk 与模型资源按需加载（chunk 懒加载是核心验收）；
 * - About 面板展示 Live2D 第三方许可声明。
 * 设置走真实 API（e2e 数据根每次运行重建）。
 */

const LIVE2D_RE = /live2d|cubismcore|\/live2d\//i;

function collectLive2dRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (LIVE2D_RE.test(url)) urls.push(url);
  });
  return urls;
}

test.describe.serial('M3 Live2D 形象', () => {
  test('① 准备对话模型（mock 供应商 + l2d-chat 默认模型）', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: '新增供应商' }).click();
    await page.getByLabel('名称').fill('形象 Mock 供应商');
    await page.getByLabel('Base URL').fill('http://mock.local/v1');
    await page.getByLabel('API Key').fill('sk-l2d-mock');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('heading', { name: '形象 Mock 供应商' }).waitFor();

    const card = page
      .locator('[data-testid^="provider-card-"]')
      .filter({ hasText: '形象 Mock 供应商' })
      .last();
    await card.locator('[id^="model-id-"]').fill('l2d-chat');
    await card.getByRole('button', { name: '添加', exact: true }).click();
    await expect(page.getByText('已添加模型 l2d-chat')).toBeVisible();

    await page.getByLabel('默认对话模型').selectOption({ label: 'l2d-chat（l2d-chat）' });
    await expect(page.getByText('设置已保存').first()).toBeVisible();
  });

  test('② 形象默认关闭：对话页无形象栏且零形象资源请求', async ({ page }) => {
    const requested = collectLive2dRequests(page);
    await page.goto('/chat');

    await expect(page.getByLabel('消息输入框')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('avatar-rail')).toHaveCount(0);

    // 等待可能的异步 chunk/预取 settle
    await page.waitForTimeout(1500);
    const leaked = requested.filter(
      (u) => !u.includes('/api/voice/settings') && !u.includes('/api/voice/models/status'),
    );
    expect(leaked).toEqual([]);
  });

  test('③ 关于面板展示 Live2D 许可声明', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('live2d-license')).toBeVisible();
    await expect(page.getByTestId('live2d-license')).toContainText('Live2D Cubism Core');
  });

  test('④ 设置开启形象：开关持久化（PUT 落库 + GET 回读）', async ({ page }) => {
    const putPromise = page
      .waitForResponse(
        (r) => r.url().includes('/api/voice/settings') && r.request().method() === 'PUT',
        { timeout: 15_000 },
      )
      .then((r) => r.json());
    await page.goto('/settings');
    await expect(page.getByTestId('avatar-enabled')).toBeVisible();
    await page.getByTestId('avatar-enabled').check();
    const payload = (await putPromise) as { success: boolean; data?: { avatarEnabled?: boolean } };
    expect(payload.success).toBe(true);
    expect(payload.data?.avatarEnabled).toBe(true);
  });

  test('⑤ 开启后对话页挂载形象栏并按需加载 chunk/模型资源', async ({ page }) => {
    const requested = collectLive2dRequests(page);
    await page.goto('/chat');

    const rail = page.getByTestId('avatar-rail');
    await expect(rail).toBeVisible({ timeout: 30_000 });
    await expect(rail).toContainText('本地形象');

    // 动态渲染 chunk（pixi/pld 独立分包）+ Cubism Core 脚本 + Haru 模型清单
    await expect
      .poll(() => requested.some((u) => u.includes('live2d-renderer')), { timeout: 30_000 })
      .toBeTruthy();
    await expect
      .poll(() => requested.some((u) => u.includes('cubismcore')), { timeout: 30_000 })
      .toBeTruthy();
    await expect
      .poll(() => requested.some((u) => u.includes('haru_greeter_t03.model3.json')), {
        timeout: 30_000,
      })
      .toBeTruthy();
  });

  test('⑥ 复位：关闭形象后形象栏消失', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('avatar-enabled').uncheck();
    await expect(page.getByTestId('avatar-enabled')).not.toBeChecked();

    await page.goto('/chat');
    await expect(page.getByTestId('avatar-rail')).toHaveCount(0);
  });

  test('⑦ M3.5 多形象：选择器列出 5 套官方角色，切换后加载对应模型并持久化', async ({ page }) => {
    // 重新开启形象（⑥ 已关闭）：先注册并消费开关自身的 PUT，避免与切模型 PUT 串台
    await page.goto('/settings');
    const enablePut = page
      .waitForResponse(
        (r) => r.url().includes('/api/voice/settings') && r.request().method() === 'PUT',
      )
      .then((r) => r.json());
    await page.getByTestId('avatar-enabled').check();
    const enablePayload = await enablePut;
    expect(enablePayload.success).toBe(true);

    const select = page.getByTestId('avatar-model');
    await expect(select).toBeVisible();
    const options = await select.locator('option').allInnerTexts();
    expect(options).toHaveLength(5);
    expect(options.join('|')).toContain('Hiyori');
    expect(options.join('|')).toContain('Mark');

    // 切换到 Hiyori：用请求体精确匹配切模型 PUT（开关 PUT 已在前面消费）
    const putPromise = page
      .waitForResponse((r) => {
        if (!r.url().includes('/api/voice/settings') || r.request().method() !== 'PUT') {
          return false;
        }
        return r.request().postDataJSON()?.avatarModelId === 'hiyori';
      })
      .then((r) => r.json());
    await select.selectOption('hiyori');
    const payload = await putPromise;
    expect(payload.success).toBe(true);
    expect(payload.data.avatarModelId).toBe('hiyori');

    // 对话页加载 Hiyori 模型清单（默认 haru 资源不应被请求）
    const requested = collectLive2dRequests(page);
    await page.goto('/chat');
    await expect(page.getByTestId('avatar-rail')).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => requested.some((u) => u.includes('/models/hiyori/Hiyori.model3.json')), {
        timeout: 30_000,
      })
      .toBeTruthy();
    expect(requested.some((u) => u.includes('haru_greeter_t03.model3.json'))).toBeFalsy();

    // 刷新后设置仍为 hiyori（持久化）
    await page.goto('/chat');
    const fresh = collectLive2dRequests(page);
    await expect(page.getByTestId('avatar-rail')).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => fresh.some((u) => u.includes('/models/hiyori/Hiyori.model3.json')), {
        timeout: 30_000,
      })
      .toBeTruthy();
  });

  test('⑧ 纯浏览器无桌宠桥：桌宠开关不渲染，裸访 /pet 回落 /chat', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('avatar-enabled')).toBeVisible();
    // 无 Electron preload → 桌宠区整块不出现
    await expect(page.getByTestId('pet-enabled-row')).toHaveCount(0);

    await page.goto('/pet?model=haru');
    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 });
    await expect(page.getByLabel('消息输入框')).toBeVisible({ timeout: 30_000 });
  });
});
