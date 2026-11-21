import { expect, test } from '@playwright/test';
import { waitForHydrated } from './utils';
import { resetE2eData } from './reset';

/**
 * v4.19 M5：桌面端侧栏桌宠入口 + 1024/1280/1440 三档窄窗复核。
 *
 * 用 addInitScript 注入最小 pet 桥模拟桌面端（Web 构建本身没有 preload），
 * 校验入口可见、未被遮挡、点击调用 open，且三档均无横向滚动与溢出。
 */

const SIZES = [
  { name: 'narrow-1024', width: 1024, height: 768 },
  { name: 'mid-1280', width: 1280, height: 800 },
  { name: 'wide-1440', width: 1440, height: 900 },
] as const;

test.beforeAll(async ({ request }) => {
  await resetE2eData(request);
});

test.describe('v4.19 侧栏桌宠入口与窄窗', () => {
  test.beforeAll(async ({ request }) => {
    await request.put('/api/settings', { data: { hasOnboarded: true } });
  });

  for (const size of SIZES) {
    test(`${size.name} ${size.width}×${size.height}：入口可见可点击且无横向溢出`, async ({
      page,
    }) => {
      await page.addInitScript(() => {
        const target = window as unknown as Record<string, unknown>;
        target.__petOpened = 0;
        target.wbfm = {
          pet: {
            open: async () => {
              target.__petOpened = Number(target.__petOpened ?? 0) + 1;
              return true;
            },
            close: async () => undefined,
            isOpen: async () => false,
            relayPerformance: () => undefined,
            onOpenChange: () => () => undefined,
            onChatRequest: () => () => undefined,
          },
        };
      });
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/chat');
      await waitForHydrated(page);
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('chat-page'), '对话页应正常渲染').toBeVisible();

      expect(
        await page.evaluate(() => {
          const el = document.documentElement;
          return el.scrollWidth - el.clientWidth;
        }),
        '不应出现横向滚动',
      ).toBeLessThanOrEqual(1);

      const entry = page.getByTestId('sidebar-pet-entry');
      await expect(entry).toBeVisible();
      const box = await entry.boundingBox();
      if (!box) throw new Error('桌宠入口缺少布局盒');
      expect(box.y + box.height, '入口应完整落在视口内').toBeLessThanOrEqual(size.height);

      // 中心点命中的必须是入口自身，避免被底栏其他控件遮挡
      const covered = await entry.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const top = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return !(top === el || el.contains(top));
      });
      expect(covered, '桌宠入口不应被遮挡').toBe(false);

      await entry.click();
      await expect
        .poll(async () =>
          page.evaluate(() => Number((window as unknown as Record<string, unknown>).__petOpened ?? 0)),
        )
        .toBe(1);

      await page.screenshot({ path: `test-results/responsive-v419/${size.name}.png` });
    });
  }
});
