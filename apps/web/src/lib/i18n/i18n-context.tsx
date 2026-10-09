'use client';

import * as React from 'react';
import type { Language } from '@wbfm/shared/constants';
import type { AppSettings } from '@wbfm/shared/types';
import {
  createTranslator,
  enUS,
  PLURAL_RULES,
  zhCN,
  type MessageKey,
  type MessageNode,
  type MessageVars,
} from '@wbfm/shared/i18n';
import { apiGet, apiPut } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';

export const LANGUAGE_STORAGE_KEY = 'wbfm-language';
const DEFAULT_LOCALE: Language = 'zh-CN';

const DICTS: Record<Language, MessageNode> = {
  'zh-CN': zhCN as MessageNode,
  'en-US': enUS as MessageNode,
};

interface I18nContextValue {
  locale: Language;
  setLocale: (locale: Language) => void;
  /** 类型化翻译：键从 zh-CN 字典机械推导，错键编译期报错 */
  t: (key: MessageKey, vars?: MessageVars) => string;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  children: React.ReactNode;
  /** 测试用：跳过服务端设置水合（避免额外 fetch 污染断言），仅用 localStorage */
  skipHydration?: boolean;
  /** 测试用：固定初始语言（配合 strictMissingKeys 做英文态缺键扫描） */
  initialLocale?: Language;
  /** 缺键/缺变量即抛错（测试 fail 模式） */
  strictMissingKeys?: boolean;
  /** 缺键豁免前缀（P1 域允许 en 缺键回退中文）：点路径前缀，如 'flowEditor' */
  allowedMissingPrefixes?: string[];
}

/** 首屏最早同步 <html lang>，逻辑与 themeInitScript 对齐 */
export const languageInitScript = `(function(){try{document.documentElement.lang=localStorage.getItem('${LANGUAGE_STORAGE_KEY}')||'${DEFAULT_LOCALE}';}catch(e){document.documentElement.lang='${DEFAULT_LOCALE}';}})();`;

export function I18nProvider({
  children,
  skipHydration = false,
  initialLocale,
  strictMissingKeys = false,
  allowedMissingPrefixes,
}: I18nProviderProps) {
  // 初始恒为默认语言，与 SSR 一致；localStorage/设置在 effect 内校正（同主题水合模式）
  const [locale, setLocaleState] = React.useState<Language>(initialLocale ?? DEFAULT_LOCALE);
  const reportedRef = React.useRef(new Set<string>());
  // 豁免列表用 ref 持有，避免重建 t
  const allowedRef = React.useRef(allowedMissingPrefixes);
  allowedRef.current = allowedMissingPrefixes;
  const strictRef = React.useRef(strictMissingKeys);
  strictRef.current = strictMissingKeys;

  // 首屏：localStorage 缓存（首帧 html lang 由 languageInitScript 已同步）
  React.useEffect(() => {
    if (initialLocale) return; // 测试固定态不读缓存
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null;
    if (stored === 'zh-CN' || stored === 'en-US') {
      setLocaleState(stored);
    }
  }, [initialLocale]);

  // 水合：服务端设置为单一真源，失败静默用缓存
  React.useEffect(() => {
    if (skipHydration || initialLocale) return;
    let cancelled = false;
    void apiGet<AppSettings>(API.settings)
      .then((settings) => {
        if (cancelled) return;
        setLocaleState(settings.language);
        localStorage.setItem(LANGUAGE_STORAGE_KEY, settings.language);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [skipHydration, initialLocale]);

  // 任意来源的语言变化都同步 <html lang>
  React.useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = React.useMemo(() => {
    return createTranslator(DICTS[locale], {
      fallbackDict: zhCN as MessageNode,
      pluralRule: PLURAL_RULES[locale],
      onMissing: (reason, ctx) => {
        if (reason === 'missingKey') {
          const allowed = allowedRef.current?.some(
            (p) => ctx.key === p || ctx.key.startsWith(`${p}.`),
          );
          if (allowed) return; // P1 域 en 缺键：安静回退中文
          if (strictRef.current) {
            throw new Error(`[i18n strict] 缺少翻译键：${ctx.key}（locale=${locale}）`);
          }
        } else if (strictRef.current) {
          throw new Error(`[i18n strict] 翻译 ${ctx.key} 缺少变量：${ctx.varName}`);
        }
        if (process.env.NODE_ENV !== 'production') {
          const sig = `${reason}:${ctx.key}:${ctx.varName ?? ''}`;
          if (!reportedRef.current.has(sig)) {
            reportedRef.current.add(sig);
            if (reason === 'missingKey') {
              console.warn(`[i18n] 缺少翻译键 ${ctx.key}（locale=${locale}），已回退中文`);
            } else {
              console.warn(`[i18n] 翻译 ${ctx.key} 缺少插值变量 ${ctx.varName}`);
            }
          }
        }
      },
    });
  }, [locale]);

  const setLocale = React.useCallback((next: Language) => {
    const previous = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null;
    // 乐观更新：立即生效 + 落缓存（html lang 由 effect 同步）
    setLocaleState(next);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    void apiPut<AppSettings>(API.settings, { language: next }).catch(() => {
      if (previous === 'zh-CN' || previous === 'en-US') {
        setLocaleState(previous);
        localStorage.setItem(LANGUAGE_STORAGE_KEY, previous);
      }
    });
  }, []);

  const value = React.useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext);
  if (!ctx) throw new Error('useI18n 必须在 I18nProvider 内使用');
  return ctx;
}

/** UI 基元等需要在无 Provider 环境（独立测试/小岛外）优雅降级时使用 */
export function useI18nOptional(): I18nContextValue | null {
  return React.useContext(I18nContext);
}
