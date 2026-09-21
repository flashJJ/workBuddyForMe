import { ApiError, type Citation, type ContentPart, type Conversation, type Message, type MessageRole, type MessageStatus } from '@wbfm/shared';
import {
  createAssistantRepository,
  createConversationRepository,
  createMessageRepository,
} from '@wbfm/database';
import type { MessageUsage } from '@wbfm/database';
import type { ServiceDeps } from './deps';

const DEFAULT_TITLE = '新会话';
const TITLE_MAX_LENGTH = 30;

/** 取首条用户消息首行前 30 字符作为会话标题；纯图片消息用图片标题兜底 */
export function deriveTitle(content: string, contentParts?: ContentPart[]): string {
  const firstLine = content.trim().split(/\r?\n/)[0] ?? '';
  if (firstLine) {
    return firstLine.length > TITLE_MAX_LENGTH
      ? `${firstLine.slice(0, TITLE_MAX_LENGTH)}…`
      : firstLine;
  }
  return contentParts?.some((part) => part.type === 'image') ? '图片对话' : DEFAULT_TITLE;
}

export function createConversationService({ db }: ServiceDeps) {
  const assistants = createAssistantRepository(db);
  const conversations = createConversationRepository(db);
  const messages = createMessageRepository(db);

  const requireConversation = (id: string): Conversation => {
    const conversation = conversations.findById(id);
    if (!conversation) throw ApiError.notFound('会话', id);
    return conversation;
  };

  return {
    create(assistantId: string, title?: string): Conversation {
      if (!assistants.findById(assistantId)) {
        throw ApiError.validation(`助手不存在：${assistantId}`);
      }
      return conversations.create({ assistantId, title });
    },

    list(assistantId?: string, limit?: number): Conversation[] {
      return conversations.list(assistantId, limit);
    },

    get(id: string): Conversation {
      return requireConversation(id);
    },

    rename(id: string, title: string): Conversation {
      requireConversation(id);
      return conversations.rename(id, title)!;
    },

    delete(id: string): void {
      requireConversation(id);
      conversations.delete(id);
    },

    listMessages(conversationId: string, limit?: number): Message[] {
      requireConversation(conversationId);
      return messages.listByConversation(conversationId, limit);
    },

    /** 追加消息；首条用户消息自动生成标题并刷新会话排序时间 */
    appendMessage(input: {
      conversationId: string;
      role: MessageRole;
      content: string;
      status?: MessageStatus;
      citations?: Citation[];
      /** v0.3：多模态片段（仅用户图片消息非空） */
      contentParts?: ContentPart[];
    }): Message {
      const conversation = requireConversation(input.conversationId);
      const saved = messages.add({
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        status: input.status ?? 'completed',
        citations: input.citations,
        contentParts: input.contentParts,
      });
      if (input.role === 'user' && conversation.title === DEFAULT_TITLE) {
        conversations.rename(conversation.id, deriveTitle(input.content, input.contentParts));
      }
      conversations.touch(conversation.id, saved.createdAt);
      return saved;
    },

    completeMessage(id: string, content: string, usage: MessageUsage | null): void {
      messages.complete(id, content, usage);
    },

    markMessageError(id: string, code: string, message: string): void {
      messages.markError(id, code, message);
    },

    stopMessage(id: string, content: string): void {
      messages.markStopped(id, content);
    },

    /** 写回工具调用轨迹 */
    saveMessageToolTrace(id: string, trace: import('@wbfm/shared').ToolTraceEntry[]): void {
      messages.saveToolTrace(id, trace);
    },

    /**
     * 重新生成前置处理：删除最后一条用户消息之后的助手消息，
     * 返回该用户消息的文本与多模态片段；没有用户消息时抛校验错误。
     */
    prepareRegenerate(conversationId: string): { content: string; contentParts: ContentPart[] } {
      requireConversation(conversationId);
      messages.deleteAssistantMessagesAfterLastUser(conversationId);
      const last = messages.findLastUserMessage(conversationId);
      if (!last) throw ApiError.validation('没有可重新生成的用户消息');
      return { content: last.content, contentParts: last.contentParts };
    },

    /** 取最近 n 条历史（供对话编排拼上下文） */
    recentMessages(conversationId: string, n: number): Message[] {
      return messages.lastN(conversationId, n);
    },
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;
