import { expect, test } from '@playwright/test';
import { waitForHydrated } from './utils';

/**
 * v2.3 M2 出口：三尺寸响应式验收。
 *
 * - 三档视口：宽 1280×800 / 中 900×700 / 窄 720×520；
 * - 共同断言：无横向滚动、主内容可见（截图输出到 test-results/responsive/ 供人工核对）；
 * - 窄档额外断言：侧栏折叠为图标态（品牌文案与导航文案隐藏，图标栏仍在）。
 *
 * 说明：md 断点为 768px，故 720×520 必然落在折叠区间；900/1280 应显示完整文字。
 */

const SIZES = [
  { name: 'wide', width: 1280, height: 800, collapsed: false },
  { name: 'medium', width: 900, height: 700, collapsed: false },
  { name: 'narrow', width: 720, height: 520, collapsed: true },
] as const;

/** v2.4 M5 / P1-3：五个列表与三个运行页（任务页含协作运行区） */
const LIST_AND_RUN_PAGES = [
  { path: '/knowledge', label: '知识库列表' },
  { path: '/flows', label: '工作流列表' },
  { path: '/assistants', label: '助手列表' },
  { path: '/tasks', label: '任务与协作运行页' },
  { path: '/flows/runs', label: '工作流运行记录' },
  { path: '/chat', label: '对话页' },
] as const;

/** 文档级横向溢出像素（>0 即出现横向滚动条） */
async function horizontalOverflow(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
}

test.describe('v2.3 响应式三尺寸', () => {
  test.beforeAll(async ({ request }) => {
    // 跳过首启向导：全新数据根会弹全屏模态遮罩，干扰布局断言
    await request.put('/api/settings', { data: { hasOnboarded: true } });
  });

  for (const size of SIZES) {
    test(`${size.name} ${size.width}×${size.height}：无横向滚动、主内容可用、侧栏文字${size.collapsed ? '隐藏' : '可见'}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/chat');
      await waitForHydrated(page);
      await page.waitForLoadState('networkidle');

      expect(await horizontalOverflow(page), '不应出现横向滚动').toBeLessThanOrEqual(1);
      await expect(page.getByTestId('chat-page')).toBeVisible();

      // 侧栏品牌文案：<768px 折叠为图标态应不可见
      const brand = page.locator('aside p').filter({ hasText: /WorkBuddyForMe/i }).first();
      if (size.collapsed) {
        await expect(brand, '窄窗品牌文案应隐藏').toBeHidden();
      } else {
        await expect(brand, '宽窗品牌文案应可见').toBeVisible();
      }

      // 导航文案同理（图标栏保留）
      const navLabel = page.locator('aside nav a span').first();
      if (size.collapsed) {
        await expect(navLabel, '窄窗导航文案应隐藏').toBeHidden();
      } else {
        await expect(navLabel, '宽窗导航文案应可见').toBeVisible();
      }
      await expect(page.locator('aside').first(), '侧栏（图标栏）仍应可见').toBeVisible();

      await page.screenshot({ path: `test-results/responsive/${size.name}.png` });
    });
  }

  test('窄窗：桌面任务表单不溢出（数值步进器与按钮同行不挤压）', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 520 });
    await page.goto('/tasks');
    await waitForHydrated(page);
    await page.waitForLoadState('networkidle');

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    // 步进器中间输入框：数字必须完整可见（v2.3 修复回归点）
    const input = page.getByRole('spinbutton').first();
    await expect(input).toBeVisible();
    const clipped = await input.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(clipped, '步进器数字不应被裁切').toBe(false);

    await page.screenshot({ path: 'test-results/responsive/narrow-tasks.png' });
  });

  // v2.4 M5 / P1-3：列表与运行页在三尺寸下统一无横向溢出（长文本用 truncate 收口）
  for (const size of SIZES) {
    test(`${size.name} ${size.width}×${size.height}：五个列表与运行页无横向溢出`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      for (const target of LIST_AND_RUN_PAGES) {
        await page.goto(target.path);
        await waitForHydrated(page);
        await page.waitForLoadState('networkidle');
        expect(
          await horizontalOverflow(page),
          `${target.label}（${size.name}）不应出现横向滚动`,
        ).toBeLessThanOrEqual(1);
      }
    });
  }
});
