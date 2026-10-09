import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * 核心页面无障碍扫描（v1.2 M3）：
 * 门禁只卡 serious/critical（moderate 出报告人工收敛，避免一次性红灯淹没）。
 * 空数据根下各页为空态/引导态，语义与可命名性与有数据时一致。
 */

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;

async function scan(page: Page, name: string): Promise<AxeResults> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const blockers = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  );
  const moderate = results.violations.filter((v) => v.impact === 'moderate');

  if (blockers.length > 0) {
    console.log(
      `[a11y:${name}] ${blockers.length} serious/critical:\n` +
        blockers
          .map(
            (v) =>
              `  - ${v.id} (${v.impact}) ${v.help}\n    节点: ${v.nodes
                .slice(0, 3)
                .map((n) => n.target.join(' '))
                .join(' | ')}`,
          )
          .join('\n'),
    );
  }
  if (moderate.length > 0) {
    console.log(
      `[a11y:${name}] moderate（人工收敛项）: ${moderate.map((v) => v.id).join(', ')}`,
    );
  }

  expect(
    blockers,
    `[${name}] 存在 ${blockers.length} 个 serious/critical a11y 违规`,
  ).toEqual([]);
  return results;
}

test.describe('a11y 核心页面（serious/critical = 0）', () => {
  test('对话页（空态）', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
    await scan(page, 'chat');
  });

  test('设置页（无供应商引导态）', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: '新增供应商' })).toBeVisible();
    await scan(page, 'settings');
  });

  test('工作流列表页（空态）', async ({ page }) => {
    await page.goto('/flows');
    await scan(page, 'flows');
  });

  test('知识库页（空态）', async ({ page }) => {
    await page.goto('/knowledge');
    await scan(page, 'knowledge');
  });

  test('命令面板打开时 combobox/listbox 语义完整', async ({ page }) => {
    await page.goto('/chat');
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: '命令面板' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('combobox', { name: '搜索并执行命令' })).toBeVisible();
    await expect(page.getByRole('listbox', { name: '命令列表' })).toBeVisible();
    await scan(page, 'command-palette');
  });

  test('跳过链接是键盘首站且可见', async ({ page }) => {
    await page.goto('/chat');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: '跳到主内容' });
    await expect(skip).toBeVisible();
    await expect(skip).toHaveAttribute('href', '#main-content');
  });
});
