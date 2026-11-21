import type { ChatMessage } from '../types';

/** mock 供应商共用的消息读取工具（探针与实际剧本都只读文本片段） */

export function messageText(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('\n')
      .trim();
  }
  return '';
}

/** 取最近一条 role:tool 的工具结果 */
export function extractToolResult(messages: ChatMessage[], toolName: string): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]!;
    if (message.role === 'tool' && message.name === toolName) {
      return typeof message.content === 'string' ? message.content : null;
    }
  }
  return null;
}
