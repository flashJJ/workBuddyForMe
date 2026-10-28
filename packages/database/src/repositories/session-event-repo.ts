import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';
import { buildFtsQuery, normalizeForFtsIndex } from '../fts-tokenize';

export const SESSION_EVENT_SCOPES = ['chat', 'task', 'flow', 'agent'] as const;
export type SessionEventScope = (typeof SESSION_EVENT_SCOPES)[number];

export interface SessionEventRow {
  id: string;
  scope: string;
  scope_id: string;
  seq: number;
  type: string;
  payload_json: string;
  schema_version: number;
  created_at: string;
}

export interface SessionEventView {
  id: string;
  scope: SessionEventScope;
  scopeId: string;
  seq: number;
  type: string;
  payload: unknown;
  schemaVersion: number;
  createdAt: string;
}

export interface SessionEventAppendInput {
  scope: SessionEventScope;
  scopeId: string;
  type: string;
  payload: unknown;
  schemaVersion?: number;
  /** 自定义时间（测试/导入用；缺省 nowIso） */
  createdAt?: string;
}

/** FTS 索引文本上限（单条事件索引不超过 200k，避免异常大载荷拖慢写入） */
const FTS_CONTENT_MAX = 200_000;

function mapEvent(row: SessionEventRow): SessionEventView {
  let payload: unknown = null;
  try {
    payload = JSON.parse(row.payload_json) as unknown;
  } catch {
    payload = null;
  }
  return {
    id: row.id,
    scope: row.scope as SessionEventScope,
    scopeId: row.scope_id,
    seq: row.seq,
    type: row.type,
    payload,
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
  };
}

function ftsContent(type: string, payloadJson: string): string {
  return normalizeForFtsIndex(`${type} ${payloadJson}`.slice(0, FTS_CONTENT_MAX));
}

export function createSessionEventRepository(db: DatabaseInstance) {
  return {
    /** 追加事件：seq 在同 scope+scopeId 内单调递增（事务内 MAX+1） */
    append(input: SessionEventAppendInput): SessionEventView {
      const id = newId();
      const payloadJson = JSON.stringify(input.payload ?? null);
      const createdAt = input.createdAt ?? nowIso();
      const insert = db.transaction(() => {
        const nextSeq = (
          db
            .prepare(
              `SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM session_events
               WHERE scope = ? AND scope_id = ?`,
            )
            .get(input.scope, input.scopeId) as { next: number }
        ).next;
        db.prepare(
          `INSERT INTO session_events(
             id, scope, scope_id, seq, type, payload_json, schema_version, created_at)
           VALUES (@id, @scope, @scopeId, @seq, @type, @payloadJson, @version, @createdAt)`,
        ).run({
          id,
          scope: input.scope,
          scopeId: input.scopeId,
          seq: nextSeq,
          type: input.type,
          payloadJson,
          version: input.schemaVersion ?? 1,
          createdAt,
        });
        db.prepare(
          `INSERT INTO session_events_fts(content, event_id, scope, scope_id)
           VALUES (?, ?, ?, ?)`,
        ).run(ftsContent(input.type, payloadJson), id, input.scope, input.scopeId);
      });
      insert();
      const row = db.prepare(`SELECT * FROM session_events WHERE id = ?`).get(id) as SessionEventRow;
      return mapEvent(row);
    },

    /** 时间线：按 seq 升序；afterSeq 用于增量续传 */
    list(scope: SessionEventScope, scopeId: string, afterSeq = 0, limit = 500): SessionEventView[] {
      const rows = db
        .prepare(
          `SELECT * FROM session_events
           WHERE scope = ? AND scope_id = ? AND seq > ?
           ORDER BY seq ASC LIMIT ?`,
        )
        .all(scope, scopeId, afterSeq, Math.min(limit, 2000)) as SessionEventRow[];
      return rows.map(mapEvent);
    },

    /** 导出/清理用：按时间倒序跨 scope 列出 */
    listAll(filter: {
      scope?: SessionEventScope;
      scopeId?: string;
      sinceIso?: string;
      limit?: number;
    } = {}): SessionEventView[] {
      const clauses: string[] = [];
      const params: Record<string, unknown> = {};
      if (filter.scope) {
        clauses.push('scope = @scope');
        params.scope = filter.scope;
      }
      if (filter.scopeId) {
        clauses.push('scope_id = @scopeId');
        params.scopeId = filter.scopeId;
      }
      if (filter.sinceIso) {
        clauses.push('created_at >= @sinceIso');
        params.sinceIso = filter.sinceIso;
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = db
        .prepare(
          `SELECT * FROM session_events ${where}
           ORDER BY created_at DESC, rowid DESC LIMIT @limit`,
        )
        .all({ ...params, limit: Math.min(filter.limit ?? 500, 5000) }) as SessionEventRow[];
      return rows.map(mapEvent);
    },

    /** 中文 2 字词全文检索（复用 uni-gram 分词） */
    search(
      query: string,
      filter: { scope?: SessionEventScope; fromIso?: string; toIso?: string; limit?: number } = {},
    ): SessionEventView[] {
      const match = buildFtsQuery(query);
      if (!match) return [];
      const clauses = ['f.session_events_fts MATCH @match'];
      const params: Record<string, unknown> = { match, limit: Math.min(filter.limit ?? 100, 500) };
      if (filter.scope) {
        clauses.push('e.scope = @scope');
        params.scope = filter.scope;
      }
      if (filter.fromIso) {
        clauses.push('e.created_at >= @fromIso');
        params.fromIso = filter.fromIso;
      }
      if (filter.toIso) {
        clauses.push('e.created_at <= @toIso');
        params.toIso = filter.toIso;
      }
      const rows = db
        .prepare(
          `SELECT e.* FROM session_events_fts f
           JOIN session_events e ON e.id = f.event_id
           WHERE ${clauses.join(' AND ')}
           ORDER BY e.created_at DESC, e.seq DESC
           LIMIT @limit`,
        )
        .all(params) as SessionEventRow[];
      return rows.map(mapEvent);
    },

    /** 保留策略：删除某时刻之前的事件与索引；返回删除条数 */
    purgeBefore(beforeMs: number): number {
      const beforeIso = new Date(beforeMs).toISOString();
      return db.transaction(() => {
        const ids = db
          .prepare(`SELECT id FROM session_events WHERE created_at < ? LIMIT 5000`)
          .all(beforeIso) as Array<{ id: string }>;
        if (ids.length === 0) return 0;
        const deleteFts = db.prepare(`DELETE FROM session_events_fts WHERE event_id = ?`);
        for (const row of ids) deleteFts.run(row.id);
        db.prepare(`DELETE FROM session_events WHERE created_at < ? LIMIT 5000`).run(beforeIso);
        return ids.length;
      })();
    },

    count(scope: SessionEventScope, scopeId: string): number {
      return (
        db
          .prepare('SELECT COUNT(*) AS n FROM session_events WHERE scope = ? AND scope_id = ?')
          .get(scope, scopeId) as { n: number }
      ).n;
    },
  };
}

export type SessionEventRepository = ReturnType<typeof createSessionEventRepository>;
