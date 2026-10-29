import type { Locator, Page } from '@playwright/test';

/**
 * 等待整页水合完成（AppProviders 的 HydrationMarker 在根被动 effect 中置位）。
 *
 * 慢机/CI 高负载下，SSR 内容早已可见但 React 事件尚未附着，立刻点击会成为
 * 无响应的「死点击」（对话框永不打开，后续 fill 超时）。任何首屏即交互的
 * 用例在 goto 之后都应先等待该标记。
 */
export async function waitForHydrated(page: Page): Promise<void> {
  await page.waitForSelector('html[data-hydrated="1"]', { timeout: 15_000 });
  // Next 15 流式渲染：路由级 loading 边界的段内容可能晚于根水合到达。
  // 切换窗口内隐藏段（div[hidden][id^="S:"]）与已挂载副本会同时存在，
  // strict mode 的 getByTestId 会命中两个节点（如 run-report-page）。
  // 等所有段容器清空，确保页面只剩一份已挂载的 DOM。
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('div[hidden][id^="S:"]')).every(
        (segment) => segment.childElementCount === 0,
      ),
    undefined,
    { timeout: 15_000 },
  );
}

/**
 * v2.3：下拉统一为 Radix 版 `SimpleSelect`（按钮触发器 + listbox），页面上**已不存在原生
 * `<select>`**，旧写法 `locator.selectOption()` 会报「Element is not a <select> element」。
 * 统一改用本组 helper：点触发器 → 在 listbox 中操作。
 */

/**
 * 按可访问名选择选项（等价于旧的 `selectOption({ label })`）。
 *
 * 取 `.first()` 对齐原生 select 语义：不同供应商可能注册同名模型
 * （如「mock-chat（mock-chat）」出现两次），原生按 label 取首个匹配，
 * 而 Radix 严格模式会因多元素命中直接报错。
 */
export async function chooseOption(
  page: Page,
  trigger: Locator,
  name: string | RegExp,
): Promise<void> {
  await trigger.click();
  await page.getByRole('option', { name }).first().click();
}

/** 按序号选择（等价于旧的 `selectOption({ index })`） */
export async function chooseOptionByIndex(page: Page, trigger: Locator, index: number): Promise<void> {
  await trigger.click();
  await page.getByRole('option').nth(index).click();
}

/** 读取全部选项文本（等价于旧的 `locator('option').allInnerTexts()`）：打开后读取，随即关闭 */
export async function optionTexts(page: Page, trigger: Locator): Promise<string[]> {
  await trigger.click();
  const texts = await page.getByRole('option').allInnerTexts();
  await page.keyboard.press('Escape');
  return texts;
}

/** 读取触发器当前展示的选中项文本（等价于旧的 `select.inputValue()` 的「读当前值」用途） */
export async function selectedText(trigger: Locator): Promise<string> {
  return (await trigger.innerText()).trim();
}
