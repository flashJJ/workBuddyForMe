'use client';

export const GLOBAL_SEARCH_EVENT = 'wbfm:global-search';

/** v4.18：命令面板 / 侧栏 / 顶栏共用同一个全局检索入口 */
export function openGlobalSearch(): void {
  window.dispatchEvent(new Event(GLOBAL_SEARCH_EVENT));
}
