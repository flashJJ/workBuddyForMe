import type { ChatMessage } from '@wbfm/ai';

/**
 * v4.11 上下文溢出重试：保留 system 消息，从最近的 user 边界保留约一半历史。
 * 必须按 user 边界切，避免拆散 assistant.tool_calls 与 tool 结果消息的配对。
 */
export function shrinkMessagesForOverflow(messages: ChatMessage[]): ChatMessage[] | null {
  const system = messages.filter((message) => message.role === 'system');
  const rest = messages.filter((message) => message.role !== 'system');
  if (rest.length < 4) return null;

  const target = Math.floor(rest.length / 2);
  let cut = -1;
  for (let index = target; index < rest.length; index += 1) {
    if (rest[index]!.role === 'user') {
      cut = index;
      break;
    }
  }
  if (cut < 0) {
    for (let index = target; index >= 0; index -= 1) {
      if (rest[index]!.role === 'user') {
        cut = index;
        break;
      }
    }
  }
  if (cut < 0) return null;
  const kept = rest.slice(cut);
  return kept.length > 0 ? [...system, ...kept] : null;
}
