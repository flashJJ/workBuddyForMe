import type { Language } from '@wbfm/shared/constants';

/**
 * Intl 接管（v1.2 M4 T4.5）：
 * 所有日期/时间/数字/百分比格式化统一走当前 locale（zh-CN/en-US），
 * 禁止再在组件里写死 'zh-CN' 或手拼日期。组件内优先用 useIntl()。
 */

export type DateInput = string | number | Date;

function toDate(input: DateInput): Date | null {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DATE_DEFAULTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};
const TIME_DEFAULTS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
};

export function formatDate(
  input: DateInput,
  locale: Language,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = toDate(input);
  if (!d) return typeof input === 'string' ? input : '';
  return new Intl.DateTimeFormat(locale, { ...DATE_DEFAULTS, ...options }).format(d);
}

export function formatTime(
  input: DateInput,
  locale: Language,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = toDate(input);
  if (!d) return typeof input === 'string' ? input : '';
  return new Intl.DateTimeFormat(locale, { ...TIME_DEFAULTS, ...options }).format(d);
}

export function formatDateTime(
  input: DateInput,
  locale: Language,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = toDate(input);
  if (!d) return typeof input === 'string' ? input : '';
  return new Intl.DateTimeFormat(locale, { ...DATE_DEFAULTS, ...TIME_DEFAULTS, ...options }).format(d);
}

/** 列表紧凑时间（月/日 时:分），用于工作流运行记录等空间受限处 */
export function formatCompactDateTime(input: DateInput, locale: Language): string {
  const d = toDate(input);
  if (!d) return '';
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatNumber(
  value: number,
  locale: Language,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatPercent(
  value: number,
  locale: Language,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, { style: 'percent', ...options }).format(value);
}
