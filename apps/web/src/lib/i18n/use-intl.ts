'use client';

import {
  formatCompactDateTime,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatTime,
} from './intl';
import { useI18n } from './use-i18n';

/** 绑定当前 locale 的 Intl 格式化器集合（语言切换即时跟随） */
export function useIntl() {
  const { locale } = useI18n();
  return {
    locale,
    formatDate: (input: Parameters<typeof formatDate>[0], options?: Intl.DateTimeFormatOptions) =>
      formatDate(input, locale, options),
    formatTime: (input: Parameters<typeof formatTime>[0], options?: Intl.DateTimeFormatOptions) =>
      formatTime(input, locale, options),
    formatDateTime: (
      input: Parameters<typeof formatDateTime>[0],
      options?: Intl.DateTimeFormatOptions,
    ) => formatDateTime(input, locale, options),
    formatCompactDateTime: (input: Parameters<typeof formatCompactDateTime>[0]) =>
      formatCompactDateTime(input, locale),
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
      formatNumber(value, locale, options),
    formatPercent: (value: number, options?: Intl.NumberFormatOptions) =>
      formatPercent(value, locale, options),
  };
}
