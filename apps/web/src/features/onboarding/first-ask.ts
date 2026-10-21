/**
 * v2.4 M1 T6：向导 firstAsk 步选中的示例问题，交给对话页自动发出。
 * 向导与 /chat 在同一次页面生命周期内，用模块级单例存文本 + 事件通知已挂载的对话页，
 * 避免依赖 effect 重跑（对话框是覆盖在对话页之上的，对话页早已挂载）。
 */
let pending: string | null = null;

/** 事件名：示例问题已就绪（对话页监听后即时发送） */
export const FIRST_ASK_EVENT = 'onboarding:first-ask';

export function setPendingFirstAsk(text: string): void {
  pending = text;
  window.dispatchEvent(new CustomEvent(FIRST_ASK_EVENT));
}

/** 取出并清空（只消费一次） */
export function takePendingFirstAsk(): string | null {
  const value = pending;
  pending = null;
  return value;
}
