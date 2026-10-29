import type { WbfmPetBridge } from '@wbfm/shared/pet';
import type { WbfmStageBridge } from '@wbfm/shared/stage';
import type { WbfmUpdaterBridge } from '@wbfm/shared/updater';
import type { WbfmNotifyBridge } from '@wbfm/shared/notify';
import type { WbfmAwarenessBridge } from '@wbfm/shared/awareness';
import type { WbfmDialogBridge } from '@wbfm/shared/dialog';

/**
 * Electron preload 通过 contextBridge 注入的桥（window.wbfm）。
 * 纯浏览器/SSR 环境为 undefined，使用方须可选访问。
 */
declare global {
  interface Window {
    wbfm?: {
      /** 托管服务 bearer token（仅生产态注入） */
      token?: string;
      /** 托管服务 base URL */
      baseUrl?: string;
      /** 是否处于 Electron 托管模式 */
      isManaged?: boolean;
      /** 自动更新桥（preload 注册后可用） */
      updater?: WbfmUpdaterBridge;
      /** 命令面板桥：主进程 Ctrl+K 全局快捷键触发 open 事件 */
      commandPalette?: { onOpen: (cb: () => void) => () => void };
      /** 快捷键浮层桥：主进程 Ctrl+/ 全局快捷键触发 open 事件（M5） */
      shortcuts?: { onOpen: (cb: () => void) => () => void };
      /** 桌宠桥（M4 伴身；仅桌面端 preload 存在，纯浏览器访问为 undefined） */
      pet?: WbfmPetBridge;
      /** v1.9 舞台窗桥（全屏舞台/截图/互斥） */
      stage?: WbfmStageBridge;
      /** v1.7 系统通知桥（提醒兜底；仅桌面端 preload 存在） */
      notify?: WbfmNotifyBridge;
      /** v2.0 M3 系统事件感知桥（解锁/锁屏/空闲；默认未武装，仅桌面端存在） */
      awareness?: WbfmAwarenessBridge;
      /** v2.7 站内深链桥（桌宠/通知 → 主窗 App Router） */
      appLinks?: { onOpen: (cb: (path: string) => void) => () => void };
      /** v2.11 桌面目录选择桥（外部代理 cwd） */
      dialog?: WbfmDialogBridge;
    };
  }
}

export {};
