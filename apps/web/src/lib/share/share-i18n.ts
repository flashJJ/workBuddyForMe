import type { Language } from '@wbfm/shared/constants';
import {
  createTranslator,
  enUS,
  PLURAL_RULES,
  zhCN,
  type MessageKey,
  type MessageNode,
  type MessageVars,
} from '@wbfm/shared/i18n';

export type ShareTranslate = (key: MessageKey, vars?: MessageVars) => string;

/**
 * 分享导出在服务端路由与纯函数序列化器中执行（无 React 上下文），
 * 用框架纯函数按 locale 现建翻译器；en 缺键机械回退 zh-CN。
 */
export function createShareTranslator(locale: Language): ShareTranslate {
  if (locale === 'en-US') {
    return createTranslator(enUS as MessageNode, {
      fallbackDict: zhCN as MessageNode,
      pluralRule: PLURAL_RULES['en-US'],
    });
  }
  return createTranslator(zhCN as MessageNode, { pluralRule: PLURAL_RULES['zh-CN'] });
}
