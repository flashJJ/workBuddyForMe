/**
 * v2.34：conversations 轨序列化（从 export.ts 拆出）。
 * 全量模式读取全部会话与消息，不再有 10,000 / 500 静默上限；
 * 增量模式只带 since 之后的新会话与新消息。
 */
import {
  createConversationRepository,
  createMessageRepository,
  type DatabaseInstance,
} from '@wbfm/database';

export interface ConversationsTrackPayload {
  json: string;
  entryCount: number;
  messageCount: number;
}

export function serializeConversationsTrack(
  db: DatabaseInstance,
  stagePlanOf: (conversationId: string) => unknown,
  since?: string,
): ConversationsTrackPayload {
  const conversations = createConversationRepository(db).listAll();
  const messagesRepo = createMessageRepository(db);
  const entries: Array<{ conversation: unknown; messages: unknown[] }> = [];
  let messageCount = 0;

  for (const conversation of conversations) {
    const isNew = !since || conversation.createdAt > since;
    const allMessages = messagesRepo.listAllByConversation(conversation.id);
    const messages = isNew ? allMessages : allMessages.filter((m) => m.createdAt > since);
    if (!isNew && messages.length === 0) continue;
    entries.push({
      // v2.20：会话级模型随 conversation 走；阶段计划为可选字段（旧版本恢复端忽略）
      conversation: { ...conversation, stagePlan: stagePlanOf(conversation.id) },
      messages,
    });
    messageCount += messages.length;
  }

  return {
    json: JSON.stringify(entries, null, 2),
    entryCount: entries.length,
    messageCount,
  };
}
