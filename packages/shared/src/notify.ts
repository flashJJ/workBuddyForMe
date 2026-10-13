/**
 * v1.7 系统通知桥契约（主进程 Notification ↔ 渲染进程）。
 *
 * 用途：角色化提醒到点但主窗/桌宠均不可见（或对话锁占用）时的兜底投递。
 * 主进程只透传标题/正文并调系统通知，不接触任何业务数据；正文限长防滥用。
 */

export const NOTIFY_TITLE_MAX = 60;
export const NOTIFY_BODY_MAX = 200;

export interface NotifyPayload {
  title: string;
  body: string;
}

/** preload 通过 contextBridge 暴露的通知桥（window.wbfm.notify） */
export interface WbfmNotifyBridge {
  /** 弹出一条系统通知（尽力而为：系统勿扰/权限关闭时静默 no-op，不抛错） */
  show(payload: NotifyPayload): Promise<void>;
}
