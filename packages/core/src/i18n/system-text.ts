import {
  createTranslator,
  encodeSystemMessage,
  renderEmbeddedMessages,
  zhCN,
  type MessageKey,
  type MessageVars,
} from '@wbfm/shared/i18n';

/**
 * core 侧系统轨迹文本的唯一入口：
 * - sys() 产出语言中立的系统消息标记（落库/交接/事件，渲染端按 UI 语言解码）；
 * - toModelText() 在模型边界把标记固定渲染为中文——模型协议语言恒定中文，
 *   模型产出与旧数据原样透传。
 * 新增系统文案时先在 messages/agent-trace.ts（zh 真源）与 en 段加 key，再在此调用。
 */
export function sys(key: MessageKey, vars?: MessageVars): string {
  return encodeSystemMessage(key, vars);
}

const tZh = createTranslator(zhCN);

/** 模型边界解码：系统标记→中文，普通文本/模型产出原样 */
export function toModelText(raw: string | null | undefined): string {
  if (!raw) return '';
  return renderEmbeddedMessages(raw, (key, vars) => tZh(key as MessageKey, vars));
}

/** 字符串数组批量解码（unfinished / 历史步摘要等喂模型场景） */
export function toModelTexts(items: readonly string[]): string[] {
  return items.map((x) => toModelText(x));
}
