import type { Assistant, Message } from '@wbfm/shared';
import type { ChatMessage } from '@wbfm/ai';
import type { RagContext } from './types';

export const HISTORY_MESSAGE_LIMIT = 20;

/** 组装系统提示词：助手人设 + 可选 RAG 参考资料块 */
export function buildSystemPrompt(assistant: Assistant, rag: RagContext | null): string {
  const parts = [assistant.systemPrompt.trim()];
  if (rag?.contextBlock) {
    parts.push(
      '请优先参考以下检索到的资料回答；资料不足时再使用你的常识，并在回答中给出引用。\n\n' +
        '【参考资料】\n' +
        rag.contextBlock,
    );
  }
  return parts.filter(Boolean).join('\n\n');
}

/** 系统提示词 + 最近历史（含本轮用户消息），过滤空系统消息 */
export function buildChatMessages(
  assistant: Assistant,
  history: Message[],
  rag: RagContext | null,
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const systemPrompt = buildSystemPrompt(assistant, rag);
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  for (const message of history) {
    messages.push({ role: message.role, content: message.content });
  }
  return messages;
}
