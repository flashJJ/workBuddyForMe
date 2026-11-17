import { enUS, zhCN } from '@wbfm/shared/i18n';
import type { BootLabels } from './boot-phases';

/** 桌面壳只区分中英两套文案；其余语言回退英文 */
export function resolveBootLang(locale: string): 'zh' | 'en' {
  return locale.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function buildBootLabels(lang: 'zh' | 'en'): BootLabels {
  const source = lang === 'zh' ? zhCN.boot : (enUS.boot ?? zhCN.boot);
  const fallback = zhCN.boot;
  return {
    prepare: source.phase?.prepare ?? fallback.phase.prepare,
    server: source.phase?.server ?? fallback.phase.server,
    workspace: source.phase?.workspace ?? fallback.phase.workspace,
    waiting: source.waiting ?? fallback.waiting,
    slow: source.slow ?? fallback.slow,
    verySlow: source.verySlow ?? fallback.verySlow,
    failed: source.failed ?? fallback.failed,
    failedHint: source.failedHint ?? fallback.failedHint,
    skip: source.skip ?? fallback.skip,
    version: source.version ?? fallback.version,
  };
}
