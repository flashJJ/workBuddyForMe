import type { Page } from '@playwright/test';

/**
 * 等待整页水合完成（AppProviders 的 HydrationMarker 在根被动 effect 中置位）。
 *
 * 慢机/CI 高负载下，SSR 内容早已可见但 React 事件尚未附着，立刻点击会成为
 * 无响应的「死点击」（对话框永不打开，后续 fill 超时）。任何首屏即交互的
 * 用例在 goto 之后都应先等待该标记。
 */
export async function waitForHydrated(page: Page): Promise<void> {
  await page.waitForSelector('html[data-hydrated="1"]', { timeout: 15_000 });
}
