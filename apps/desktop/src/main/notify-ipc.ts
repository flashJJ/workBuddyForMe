/**
 * v1.7 系统通知 IPC（角色化提醒兜底）。
 *
 * 纯注册表 + 可注入 Notification 构造器（测试不触达系统通知中心）：
 * - 通道单一：notify:show（invoke/handle）；
 * - 参数白名单裁剪（title/body 字符串限长），非法负载静默 no-op 不抛错；
 * - 系统勿扰/权限导致的失败由 Electron 内部消化，渲染端不感知成败。
 */
import { Notification } from 'electron';
import {
  NOTIFY_BODY_MAX,
  NOTIFY_TITLE_MAX,
  type NotifyPayload,
} from '@wbfm/shared/notify';

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => unknown,
  ): void;
}

export interface NotificationLike {
  show(): void;
}

export type NotificationCtor = (init: { title: string; body: string }) => NotificationLike;

const defaultCtor: NotificationCtor = (init) => new Notification(init);

/** 从 unknown IPC 负载提取合法通知内容；非法返回 null */
export function normalizeNotifyPayload(raw: unknown): NotifyPayload | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.title !== 'string' || typeof candidate.body !== 'string') return null;
  const title = candidate.title.trim();
  const body = candidate.body.trim();
  if (!title || !body) return null;
  return {
    title: title.slice(0, NOTIFY_TITLE_MAX),
    body: body.slice(0, NOTIFY_BODY_MAX),
  };
}

/** 注册 notify:show；重复注册由 Electron 自身报错（仅启动期调用一次） */
export function registerNotifyIpc(
  ipc: IpcMainLike,
  ctor: NotificationCtor = defaultCtor,
): void {
  ipc.handle('notify:show', (_event, raw) => {
    const payload = normalizeNotifyPayload(raw);
    if (!payload) return;
    try {
      ctor(payload).show();
    } catch {
      // 系统通知不可用（勿扰/精简系统）：提醒已标记触发，静默降级
    }
  });
}
