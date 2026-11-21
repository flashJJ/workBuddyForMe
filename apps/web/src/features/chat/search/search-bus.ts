'use client';

export const MESSAGE_SEARCH_EVENT = 'wbfm:message-search';

/** v4.17：命令面板 / 侧栏 / 顶栏共用同一个检索入口 */
export function openMessageSearch(): void {
  window.dispatchEvent(new Event(MESSAGE_SEARCH_EVENT));
}
