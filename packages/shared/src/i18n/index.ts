/** @wbfm/shared/i18n：自研 i18n 框架（零运行时依赖），域子路径见 package.json exports */
export type {
  DeepPartialMessages,
  MessageKeyPaths,
  MessageNode,
  MessageVars,
  MissingContext,
  MissingReason,
  PluralForm,
  PluralRule,
} from './types';
export { zhCN, type ZhDictionary } from './zh-CN';
export { enUS, type EnDictionary } from './en-US';
export { PLURAL_RULES } from './plural-rules';
export {
  createTranslator,
  lookup,
  translate,
  type TranslateOptions,
} from './t';

import type { MessageKeyPaths } from './types';
import type { ZhDictionary } from './zh-CN';

/** 全部合法 i18n 键（从 zh-CN 机械推导，t() 调用编译期校验） */
export type MessageKey = MessageKeyPaths<ZhDictionary>;
