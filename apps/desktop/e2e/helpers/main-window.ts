import type { ElectronApplication, Page } from '@playwright/test';

const POLL_MS = 150;
const DEFAULT_TIMEOUT_MS = 120_000;

function isSplashUrl(url: string): boolean {
  return url.includes('/splash/') || url.includes('splash\\index.html');
}

/** v4.5：启动画面是第一个窗口，既有 e2e 必须按 URL 排除后再取主窗 */
export async function waitForSplashWindow(
  app: ElectronApplication,
  timeoutMs = 30_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = app.windows().find((page) => isSplashUrl(page.url()));
    if (hit) return hit;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error('splash window not found');
}

export async function waitForMainWindow(
  app: ElectronApplication,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      if (isSplashUrl(page.url())) continue;
      try {
        if ((await page.title()) === 'WorkBuddyForMe') return page;
      } catch {
        // 页面仍在导航
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error('main window not found');
}

export async function hasSplashWindow(app: ElectronApplication): Promise<boolean> {
  return app.windows().some((page) => isSplashUrl(page.url()));
}
