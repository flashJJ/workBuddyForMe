import type { WbfmUpdaterBridge } from '@wbfm/shared';

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
    };
  }
}

export {};
