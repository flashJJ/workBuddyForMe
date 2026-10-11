import { renderEmbeddedMessages, type MessageKey, type MessageVars } from '@wbfm/shared/i18n';
import { createShareTranslator } from '@/lib/share/share-i18n';
import { getCurrentLocale } from './current-locale';

/**
 * 非 React 场景的系统轨迹文本解码：按当前 UI 语言现建翻译器渲染 system-message 标记，
 * 普通文本/模型产出原样透传。每次调用读一次 locale（语言切换不会在单次回调中途发生）。
 */
export function translateSystemText(raw?: string | null): string {
  if (!raw) return '';
  const tt = createShareTranslator(getCurrentLocale());
  return renderEmbeddedMessages(raw, (key, vars) => tt(key as MessageKey, vars as MessageVars));
}

/** 非 React 场景翻译固定 i18n key（SSE 兜底文案等） */
export function translateSystemKey(key: MessageKey, vars?: MessageVars): string {
  return createShareTranslator(getCurrentLocale())(key, vars);
}
