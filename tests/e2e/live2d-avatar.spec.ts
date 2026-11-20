import { expect, test, type Page } from '@playwright/test';
import { chooseOption, optionTexts, revealSettingsSection } from './utils';

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
  // 单独运行本 spec 时也要跳过首启向导；完整套件中该状态通常已由 00-onboarding 写入
  test.beforeAll(async ({ request }) => {
    await request.put('/api/settings', { data: { hasOnboarded: true, language: 'zh-CN' } });
    // 新用户默认形象是内置 VRM（vrm:builtin:xuetuan）：本 spec 校验 Live2D 资源按需加载，
    // 必须显式固定 haru 并复位开关。否则 CI 全新数据根下 ⑤ 挂载的是 VrmCanvas（永远等不到
    // cubismcore/haru 请求）；serial 重试也会被上一次失败残留的 avatarEnabled=true 污染。
    await request.put('/api/voice/settings', {
      data: { avatarEnabled: false, avatarModelId: 'haru' },
    });
  });

  test('① 准备对话模型（mock 供应商 + l2d-chat 默认模型）', async ({ request }) => {
    // 直接用 API 播种：serial 重试幂等，也不依赖供应商表单的保存链路
    const existingRes = await request.get('/api/providers');
    const existing = ((await existingRes.json()) as {
      data?: Array<{ id: string; name: string }>;
    }).data ?? [];
    for (const provider of existing.filter((item) => item.name === '形象 Mock 供应商')) {
      await request.delete(`/api/providers/${provider.id}`);
    }

    const providerRes = await request.post('/api/providers', {
      data: {
        name: '形象 Mock 供应商',
        protocol: 'openai-compatible',
        baseUrl: 'http://mock.local/v1',
        apiKey: 'sk-l2d-mock',
      },
    });
    expect(providerRes.ok()).toBeTruthy();
    const provider = ((await providerRes.json()) as { data: { id: string } }).data;

    const modelRes = await request.post(`/api/providers/${provider.id}/models`, {
      data: { modelId: 'l2d-chat', capabilities: ['chat'], contextWindow: 8_192 },
    });
    expect(modelRes.ok()).toBeTruthy();
    const model = ((await modelRes.json()) as { data: { id: string } }).data;

    await request.put('/api/settings', { data: { defaultChatModelId: model.id } });
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
    await revealSettingsSection(page, 'voice');
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

    // Cubism Core 脚本 + Haru 模型清单（生产构建的 chunk 文件名带哈希，不能断言 webpackChunkName）
    await expect
      .poll(() => requested.some((u) => u.includes('cubismcore')), { timeout: 60_000 })
      .toBeTruthy();
    await expect
      .poll(() => requested.some((u) => u.includes('haru_greeter_t03.model3.json')), {
        timeout: 60_000,
      })
      .toBeTruthy();
  });

  test('⑥ 复位：关闭形象后形象栏消失', async ({ page }) => {
    const putPromise = page
      .waitForResponse(
        (r) => r.url().includes('/api/voice/settings') && r.request().method() === 'PUT',
        { timeout: 15_000 },
      )
      .then((r) => r.json());
    await page.goto('/settings');
    await revealSettingsSection(page, 'voice');
    await page.getByTestId('avatar-enabled').uncheck();
    await expect(page.getByTestId('avatar-enabled')).not.toBeChecked();
    // 等待关闭落库后再导航，避免 PUT 被路由切换中断（与 ④/⑦ 同一等待口径）
    const payload = (await putPromise) as { success: boolean; data?: { avatarEnabled?: boolean } };
    expect(payload.success).toBe(true);
    expect(payload.data?.avatarEnabled).toBe(false);

    await page.goto('/chat');
    await expect(page.getByTestId('avatar-rail')).toHaveCount(0);
  });

  test('⑦ M3.5 多形象：选择器列出 5 套官方角色，切换后加载对应模型并持久化', async ({ page }) => {
    // 重新开启形象（⑥ 已关闭）：先注册并消费开关自身的 PUT，避免与切模型 PUT 串台
    await page.goto('/settings');
    await revealSettingsSection(page, 'voice');
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
    const options = await optionTexts(page, select);
    // v2.0 起选择器同时包含内置 VRM（雪团/冉卡露丽/菲比）；本用例只校验 5 套 Live2D 官方角色
    const live2dPrefixes = ['Haru · ', 'Hiyori · ', 'Mark · ', 'Mao · ', 'Wanko · '];
    const live2dOptions = options.filter((text) =>
      live2dPrefixes.some((prefix) => text.startsWith(prefix)),
    );
    expect(live2dOptions).toHaveLength(5);
    expect(live2dOptions.join('|')).toContain('Hiyori');
    expect(live2dOptions.join('|')).toContain('Mark');

    // 切换到 Hiyori（选项文案来自 avatar-models.ts 的 avatar.models.hiyori，经 t() 渲染）：
    // 用请求体精确匹配切模型 PUT（开关 PUT 已在前面消费）
    const putPromise = page
      .waitForResponse((r) => {
        if (!r.url().includes('/api/voice/settings') || r.request().method() !== 'PUT') {
          return false;
        }
        return r.request().postDataJSON()?.avatarModelId === 'hiyori';
      })
      .then((r) => r.json());
    await chooseOption(page, select, 'Hiyori · 百濑日和（休闲少女）');
    const payload = await putPromise;
    expect(payload.success).toBe(true);
    expect(payload.data.avatarModelId).toBe('hiyori');

    // M4.5：角色绑定 Kokoro 声线（Hiyori → zf_026 / sid 18）；
    // v2.4 D9 起默认朗读引擎为 MeloTTS（单声线，不显示角色声线绑定），
    // 本段断言的是 Kokoro 绑定契约，故先显式切回 Kokoro 再校验。
    await page.request.put('/api/voice/settings', { data: { ttsModel: 'kokoro' } });
    await page.reload();
    await revealSettingsSection(page, 'voice');
    // e2e 临时数据根无 TTS 模型，试听按钮渲染但禁用
    const voiceRow = page.getByTestId('avatar-voice-row');
    await expect(voiceRow).toContainText('zf_026');
    await expect(voiceRow).toContainText('sid 18');
    await expect(page.getByTestId('avatar-voice-preview')).toBeDisabled();

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
    await revealSettingsSection(page, 'voice');
    await expect(page.getByTestId('avatar-enabled')).toBeVisible();
    // 无 Electron preload → 桌宠区整块不出现
    await expect(page.getByTestId('pet-enabled-row')).toHaveCount(0);

    await page.goto('/pet?model=haru');
    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 });
    await expect(page.getByLabel('消息输入框')).toBeVisible({ timeout: 30_000 });
  });
});
