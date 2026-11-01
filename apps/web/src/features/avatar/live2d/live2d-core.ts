/**
 * Cubism Core（专有免费再分发脚本）加载器。
 * 必须在 pixi-live2d-display 模块求值前以普通 script 注入（其初始化期读取全局 Live2DCubismCore）。
 * 脚本位于 public/live2d/core，仅在形象组件的动态 chunk 中被调用——关闭形象零网络/零解析。
 */

const CORE_SRC = '/live2d/core/live2dcubismcore.min.js';
const GLOBAL_KEY = 'Live2DCubismCore';

let loading: Promise<void> | null = null;

declare global {
  interface Window {
    Live2DCubismCore?: unknown;
  }
}

/** 幂等注入 Cubism Core；已存在（如外部页面预置）直接复用 */
export function loadCubismCore(): Promise<void> {
  if (typeof window !== 'undefined' && window[GLOBAL_KEY]) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CORE_SRC;
    script.async = true;
    script.dataset.live2dCore = '1';
    script.onload = () => {
      if (window[GLOBAL_KEY]) resolve();
      else reject(new Error('Cubism Core 已加载但全局对象 Live2DCubismCore 缺失'));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error('Cubism Core 脚本加载失败'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
