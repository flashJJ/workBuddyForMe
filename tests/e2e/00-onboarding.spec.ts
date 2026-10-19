import { expect, test } from '@playwright/test';
import { waitForHydrated } from './utils';

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

    // 语音步 → 第一句话步 → 完成步 → 进入应用
    await page.getByTestId('ob-next').click();
    await expect(page.getByTestId('onboarding-voice')).toBeVisible();
    await page.getByTestId('ob-next').click();
    await expect(page.getByTestId('onboarding-firstask')).toBeVisible();
    await page.getByTestId('ob-next').click();
    await expect(page.getByTestId('onboarding-finish')).toBeVisible();
    await page.getByTestId('ob-enter').click();
    await expect(dialog).toBeHidden();

    // 设置已落盘（弹窗隐藏是乐观更新，落盘 PUT 在冷编译下可能稍晚，轮询读不抢跑）
    await expect
      .poll(
        async () => {
          const settings = await page.request.get('/api/settings');
          const body = (await settings.json()) as { data: { hasOnboarded: boolean } };
          return body.data.hasOnboarded;
        },
        { timeout: 10_000 },
      )
      .toBe(true);

    // 刷新不再自动弹
    await page.reload();
    await expect(dialog).toBeHidden();
  });

  test('演示模式：不填 Key 一键开启即可首答，徽标常显且可关闭无残留', async ({ page }) => {
    // 从首启态开始（复用旧 dev server 时也能确定性复现）
    await page.request.put('/api/settings', {
      data: { hasOnboarded: false, demoModeEnabled: false },
    });
    await page.goto('/chat');

    const dialog = page.getByTestId('onboarding-dialog');
    await expect(dialog).toBeVisible();
    await page.getByTestId('ob-next').click();

    // 第 2 步默认聚焦演示模式卡片，一键开启（不填任何 Key）
    await expect(page.getByTestId('onboarding-provider')).toBeVisible();
    await page.getByTestId('ob-tab-demo').click();
    await expect(page.getByTestId('onboarding-demo')).toBeVisible();
    await page.getByTestId('ob-demo-enable').click();
    await expect(page.getByTestId('ob-demo-ready')).toBeVisible();

    // T5 首字延迟自检：演示模式（mock，无外网）应给出人话结论 + 「换一个来源」出口
    await expect(page.getByTestId('ob-latency-conclusion')).toContainText('预计首字约');
    await expect(page.getByTestId('ob-latency-switch')).toBeVisible();

    // 语音步 → firstAsk 步：点示例即发问并落到 /chat（T6）
    await page.getByTestId('ob-next').click();
    await expect(page.getByTestId('onboarding-voice')).toBeVisible();
    await page.getByTestId('ob-next').click();
    await expect(page.getByTestId('onboarding-firstask')).toBeVisible();
    await page.getByTestId('ob-firstask-general').click();
    await expect(dialog).toBeHidden();

    // 首答成功：向导示例问题已自动发出，mock 回显（演示模式无外网依赖）
    await expect(page.getByText(/mock 模型/).first()).toBeVisible({ timeout: 30_000 });

    // 全局徽标常显
    await expect(page.getByTestId('demo-mode-badge')).toBeVisible();

    // 一键关闭：清理 demo 供应商与模型、清空默认模型，徽标消失
    await page.goto('/settings');
    await waitForHydrated(page);
    // T7：首答已发生，关于页应可读到 TTFV 里程碑（安装 → 模型就绪 → 首答）
    await expect(page.getByTestId('about-ttfv-value')).toContainText('首答用时');
    await expect(page.getByTestId('about-ttfv-model-ready')).not.toHaveText('—');
    await page.getByTestId('demo-mode-toggle').click();
    await expect(page.getByTestId('demo-mode-on')).toBeHidden();
    await expect(page.getByTestId('demo-mode-badge')).toBeHidden();

    // 无残留：demo 供应商已删；demoModeEnabled=false 且默认对话模型已清空
    await expect
      .poll(async () => {
        const res = await page.request.get('/api/providers');
        const body = (await res.json()) as { data: Array<{ id: string }> };
        return body.data.some((provider) => provider.id === 'demo');
      })
      .toBe(false);
    await expect
      .poll(async () => {
        const res = await page.request.get('/api/settings');
        const body = (await res.json()) as {
          data: { demoModeEnabled?: boolean; defaultChatModelId: string | null };
        };
        return body.data.demoModeEnabled === false && body.data.defaultChatModelId === null;
      })
      .toBe(true);

    // T7 空态统一：无可用模型时对话页空态可直接调起配置向导
    await page.goto('/chat');
    const openWizard = page.getByTestId('chat-open-wizard');
    await expect(openWizard).toBeVisible();
    await openWizard.click();
    await expect(page.getByTestId('onboarding-dialog')).toBeVisible();
    await page.getByTestId('ob-skip').click();
    await expect(page.getByTestId('onboarding-dialog')).toBeHidden();
  });

  test('关于面板可重放向导；Ctrl+/ 唤起快捷键浮层；帮助锚点可达', async ({ page }) => {
    await page.goto('/settings');
    // 重放入口在 SSR HTML 中已可见但点击依赖水合后挂载的 window 事件；
    // 慢机（CI）不等水合直接点会成为死点击（v1.8 设置页面板变重后必现）
    await waitForHydrated(page);

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
