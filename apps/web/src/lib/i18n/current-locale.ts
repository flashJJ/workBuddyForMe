import type { Language } from '@wbfm/shared/constants';

/** 语言 localStorage 键（与 i18n-context 水合同步共用，抽到纯 ts 供非 React 模块读取） */
export const LANGUAGE_STORAGE_KEY = 'wbfm-language';

/**
 * 读取当前 UI 语言（非 React 场景：SSE 回调/纯函数/服务端无关工具）。
 * 优先 <html lang>（languageInitScript 首帧即同步），localStorage 兜底，默认 zh-CN。
 * 组件内需要语言切换即时响应时仍用 useI18n()。
 */
export function getCurrentLocale(): Language {
  if (typeof document !== 'undefined') {
    const lang = document.documentElement.lang;
    if (lang === 'en-US' || lang === 'zh-CN') return lang;
  }
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'en-US' || stored === 'zh-CN') return stored;
  } catch {
    // SSR / 隐私模式不可用时走默认
  }
  return 'zh-CN';
}
