import type { DatabaseInstance } from '../client';
import type { Conversation } from '@wbfm/shared';
import { newId, nowIso, mapConversation, type ConversationRow } from './mappers';

export interface ConversationCreateFields {
  assistantId: string;
  title?: string;
}

export function createConversationRepository(db: DatabaseInstance) {
  return {
    create(fields: ConversationCreateFields): Conversation {
      const id = newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO conversations(id, assistant_id, title, last_message_at, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?)`,
      ).run(id, fields.assistantId, fields.title ?? '新会话', ts, ts);
      return this.findById(id)!;
    },

    findById(id: string): Conversation | null {
      const row = db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(id) as
        | ConversationRow
        | undefined;
      return row ? mapConversation(row) : null;
    },

    /** 最近会话在前；无消息（last_message_at NULL）沉底 */
    list(assistantId?: string, limit = 100): Conversation[] {
      const where = assistantId ? `WHERE assistant_id = ?` : '';
      const rows = db
        .prepare(
          `SELECT * FROM conversations ${where}
           ORDER BY last_message_at IS NULL, last_message_at DESC, created_at DESC
           LIMIT ?`,
        )
        .all(...(assistantId ? [assistantId, limit] : [limit])) as ConversationRow[];
      return rows.map(mapConversation);
    },

    rename(id: string, title: string): Conversation | null {
      db.prepare(`UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?`).run(
        title,
        nowIso(),
        id,
      );
      return this.findById(id);
    },

    touch(id: string, when = nowIso()): void {
      db.prepare(
        `UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE id = ?`,
      ).run(when, when, id);
    },

    delete(id: string): boolean {
      return db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id).changes > 0;
    },
  };
}

export type ConversationRepository = ReturnType<typeof createConversationRepository>;
