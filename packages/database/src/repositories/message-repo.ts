import type { DatabaseInstance } from '../client';
import type { Citation, ContentPart, Message, ToolTraceEntry } from '@wbfm/shared/types';
import type { MessageFeedback, MessageRole, MessageStatus } from '@wbfm/shared/constants';
import { newId, nowIso, mapMessage, type MessageRow } from './mappers';

export interface MessageAddFields {
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  citations?: Citation[];
  toolTrace?: ToolTraceEntry[];
  /** v0.3：多模态片段（仅 user 消息可能携带图片） */
  contentParts?: ContentPart[];
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
           (id, conversation_id, role, content, status, citations, tool_trace, content_parts,
            created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        fields.conversationId,
        fields.role,
        fields.content,
        fields.status,
        JSON.stringify(fields.citations ?? []),
        JSON.stringify(fields.toolTrace ?? []),
        JSON.stringify(fields.contentParts ?? []),
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

    /**
     * v0.5：跳过最早 skip 条（已折叠进摘要的消息）后，取最近 n 条（时间正序）。
     * skip 为 conversations.summary_turns。
     * 注意不能用 DESC + OFFSET（那会跳过最新消息）：以「第 skip 条最旧消息」的
     * rowid 为阈值（rowid > 阈值），再取阈值之后的最新 n 条；skip=0 不加阈值；
     * skip >= 总条数时阈值为最后一条（或 NULL），结果为空。
     */
    lastNAfter(conversationId: string, skip: number, n: number): Message[] {
      const threshold =
        skip > 0
          ? `AND rowid > (
               SELECT rowid FROM messages
               WHERE conversation_id = @cid AND status != 'error'
               ORDER BY created_at ASC, rowid ASC LIMIT 1 OFFSET @skipMinusOne
             )`
          : '';
      const rows = db
        .prepare(
          `SELECT * FROM (
             SELECT *, rowid AS _rowid FROM messages
             WHERE conversation_id = @cid AND status != 'error' ${threshold}
             ORDER BY created_at DESC, rowid DESC LIMIT @n
           ) ORDER BY created_at ASC, _rowid ASC`,
        )
        .all({ cid: conversationId, skipMinusOne: skip - 1, n }) as MessageRow[];
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

    /** 流式结束后写回工具调用轨迹 */
    saveToolTrace(id: string, trace: ToolTraceEntry[]): void {
      db.prepare(`UPDATE messages SET tool_trace = ? WHERE id = ?`).run(
        JSON.stringify(trace),
        id,
      );
    },

    /** v0.5 P1-2：写入/取消消息反馈，返回更新后的消息（不存在为 null） */
    setFeedback(id: string, feedback: MessageFeedback | null): Message | null {
      db.prepare(
        `UPDATE messages SET feedback = ?, feedback_at = ? WHERE id = ?`,
      ).run(feedback, feedback ? nowIso() : null, id);
      return this.findById(id);
    },

    /**
     * 重新生成前置清理：删除某会话最后一条用户消息之后的所有助手消息。
     * 返回被删除条数（幂等：无尾随助手消息时为 0）。
     */
    deleteAssistantMessagesAfterLastUser(conversationId: string): number {
      const lastUser = db
        .prepare(
          `SELECT rowid AS rowid FROM messages
             WHERE conversation_id = ? AND role = 'user'
             ORDER BY created_at DESC, rowid DESC LIMIT 1`,
        )
        .get(conversationId) as { rowid: number } | undefined;
      if (!lastUser) return 0;
      return db
        .prepare(
          `DELETE FROM messages WHERE conversation_id = ? AND role = 'assistant' AND rowid > ?`,
        )
        .run(conversationId, lastUser.rowid).changes;
    },

    /** 取会话最后一条用户消息（重新生成时沿用文本与图片片段） */
    findLastUserMessage(conversationId: string): Message | null {
      const row = db
        .prepare(
          `SELECT * FROM messages
             WHERE conversation_id = ? AND role = 'user'
             ORDER BY created_at DESC, rowid DESC LIMIT 1`,
        )
        .get(conversationId) as MessageRow | undefined;
      return row ? mapMessage(row) : null;
    },

    /** 最近一条带 completion 用量的 completed 助手消息（v0.5 输出预留校准用） */
    lastAssistantUsage(conversationId: string): { completionTokens: number } | null {
      const row = db
        .prepare(
          `SELECT completion_tokens FROM messages
             WHERE conversation_id = ? AND role = 'assistant'
               AND status = 'completed' AND completion_tokens IS NOT NULL
             ORDER BY created_at DESC, rowid DESC LIMIT 1`,
        )
        .get(conversationId) as { completion_tokens: number } | undefined;
      return row ? { completionTokens: row.completion_tokens } : null;
    },
  };
}

export type MessageRepository = ReturnType<typeof createMessageRepository>;
