import type { ChatMessage } from '@wbfm/ai';
import { estimateTokens } from '../../context/context-budget';

/** 折叠保留的头尾长度（字符） */
const FOLD_HEAD_CHARS = 600;
const FOLD_TAIL_CHARS = 300;
const FOLD_MARKER = '\n…（较早的工具结果已折叠；需要细节可重新抓取该页面）…\n';

function contentOf(message: ChatMessage): string | null {
  return typeof message.content === 'string' ? message.content : null;
}

function isFolded(text: string): boolean {
  return text.includes(FOLD_MARKER.trim().slice(0, 12));
}

/** 当前出站消息里工具结果的 token 估算总量 */
export function toolMessagesTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const message of messages) {
    if (message.role !== 'tool') continue;
    const text = contentOf(message);
    if (text) total += estimateTokens(text);
  }
  return total;
}

function fold(text: string): string {
  const head = text.slice(0, FOLD_HEAD_CHARS);
  const tail = text.slice(-FOLD_TAIL_CHARS);
  return `${head}${FOLD_MARKER}${tail}\n（原文 ${text.length} 字符）`;
}

/**
 * v4.11 工具结果预算：超出预算时从最旧的工具消息开始折叠，
 * 最新一条永不折叠（刚拿到的内容必须完整）。
 * 返回实际折叠条数，供调用方记录。
 */
export function enforceToolResultBudget(
  messages: ChatMessage[],
  budgetTokens: number,
): number {
  const toolIndexes: number[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]!.role === 'tool' && contentOf(messages[index]!) !== null) {
      toolIndexes.push(index);
    }
  }
  if (toolIndexes.length <= 1) return 0;

  let total = toolMessagesTokens(messages);
  if (total <= budgetTokens) return 0;

  let folded = 0;
  // 最新一条（最后一个索引）保持完整
  for (const index of toolIndexes.slice(0, -1)) {
    if (total <= budgetTokens) break;
    const message = messages[index]!;
    const text = contentOf(message);
    if (!text || isFolded(text)) continue;
    const before = estimateTokens(text);
    const next = fold(text);
    messages[index] = { ...message, content: next };
    total += estimateTokens(next) - before;
    folded += 1;
  }
  return folded;
}
