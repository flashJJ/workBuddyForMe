import type { DatabaseInstance } from '../client';
import type { Citation, Message, MessageRole, MessageStatus } from '@wbfm/shared';
import { newId, nowIso, mapMessage, type MessageRow } from './mappers';

export interface MessageAddFields {
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  citations?: Citation[];
}

export interface MessageUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export function createMessageRepository(db: DatabaseInstance) {
  return {
    add(fields: MessageAddFields): Message {
      const id = newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO messages
           (id, conversation_id, role, content, status, citations, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        fields.conversationId,
        fields.role,
        fields.content,
        fields.status,
        JSON.stringify(fields.citations ?? []),
        ts,
      );
      return this.findById(id)!;
    },

    findById(id: string): Message | null {
      const row = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as
        | MessageRow
        | undefined;
      return row ? mapMessage(row) : null;
    },

    listByConversation(conversationId: string, limit = 200): Message[] {
      return (
        db
          .prepare(
            `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC LIMIT ?`,
          )
          .all(conversationId, limit) as MessageRow[]
      ).map(mapMessage);
    },

    /** 取最近 n 条（按时间正序返回，便于直接拼 prompt 上下文） */
    lastN(conversationId: string, n: number): Message[] {
      const rows = db
        .prepare(
          `SELECT * FROM (
             SELECT *, rowid AS _rowid FROM messages
             WHERE conversation_id = ? AND status != 'error'
             ORDER BY created_at DESC, rowid DESC LIMIT ?
           ) ORDER BY created_at ASC, _rowid ASC`,
        )
        .all(conversationId, n) as MessageRow[];
      return rows.map(mapMessage);
    },

    /** 流式结束后写回完整内容、状态与 token 用量 */
    complete(id: string, content: string, usage: MessageUsage | null): void {
      db.prepare(
        `UPDATE messages SET
           content = ?, status = 'completed',
           prompt_tokens = ?, completion_tokens = ?, total_tokens = ?
         WHERE id = ?`,
      ).run(
        content,
        usage?.promptTokens ?? null,
        usage?.completionTokens ?? null,
        usage?.totalTokens ?? null,
        id,
      );
    },

    markError(id: string, code: string, message: string): void {
      db.prepare(
        `UPDATE messages SET status = 'error', error_code = ?, error_message = ? WHERE id = ?`,
      ).run(code, message, id);
    },

    /** 用户主动中断：保留已生成片段，状态置 stopped */
    markStopped(id: string, content: string): void {
      db.prepare(`UPDATE messages SET status = 'stopped', content = ? WHERE id = ?`).run(
        content,
        id,
      );
    },
  };
}

export type MessageRepository = ReturnType<typeof createMessageRepository>;
