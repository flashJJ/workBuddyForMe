import type { Language } from '../constants';
import type { PluralRule } from './types';

/**
 * 各语言的 ICU-lite 复数选择规则（仅 one/other）：
 * - 中文无复数形态，恒取 other
 * - 英文 n === 1 取 one（含 -1/1.0 以外的常规整数场景足够覆盖）
 */
export const PLURAL_RULES: Record<Language, PluralRule> = {
  'zh-CN': () => 'other',
  'en-US': (n) => (n === 1 ? 'one' : 'other'),
};
