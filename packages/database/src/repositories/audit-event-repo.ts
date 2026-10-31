import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';

/**
 * v2.13 M3：审计账本仓储。
 * - 只追加，不提供 update / delete；
 * - seq 由调用方（审计服务）按上一条 +1 分配，唯一索引兜底；
 * - 列表按 seq 倒序供页面翻页；校验 / 导出用升序扫描。
 */

export interface AuditEventRow {
  id: string;
  seq: number;
  created_at: string;
  kind: string;
  actor: string;
  run_id: string | null;
  conversation_id: string | null;
  tool: string | null;
  decision: string | null;
  reason_code: string | null;
  policy_hash: string | null;
  binding_json: string | null;
  outcome: string | null;
  prev_hash: string;
  hash: string;
}

export interface AuditEventAppendFields {
  id?: string;
  seq: number;
  kind: string;
  actor: string;
  createdAt?: string;
  runId?: string | null;
  conversationId?: string | null;
  tool?: string | null;
  decision?: string | null;
  reasonCode?: string | null;
  policyHash?: string | null;
  bindingJson?: string | null;
  outcome?: string | null;
  prevHash: string;
  hash: string;
}

export interface AuditEventListFilter {
  from?: string;
  to?: string;
  kind?: string;
  runId?: string;
  /** 仅取 seq > cursor（倒序翻页） */
  afterSeq?: number;
  limit?: number;
}

export interface AuditChainTail {
  seq: number;
  hash: string;
}

export interface AuditRangeFilter {
  from: string;
  to: string;
  /** 仅取 seq > cursor（升序区间翻页） */
  afterSeq?: number;
  limit?: number;
}

export function createAuditEventRepository(db: DatabaseInstance) {
  return {
    append(fields: AuditEventAppendFields): AuditEventRow {
      const row: AuditEventRow = {
        id: fields.id ?? newId(),
        seq: fields.seq,
        created_at: fields.createdAt ?? nowIso(),
        kind: fields.kind,
        actor: fields.actor,
        run_id: fields.runId ?? null,
        conversation_id: fields.conversationId ?? null,
        tool: fields.tool ?? null,
        decision: fields.decision ?? null,
        reason_code: fields.reasonCode ?? null,
        policy_hash: fields.policyHash ?? null,
        binding_json: fields.bindingJson ?? null,
        outcome: fields.outcome ?? null,
        prev_hash: fields.prevHash,
        hash: fields.hash,
      };
      db.prepare(
        `INSERT INTO audit_events
           (id, seq, created_at, kind, actor, run_id, conversation_id, tool, decision,
            reason_code, policy_hash, binding_json, outcome, prev_hash, hash)
         VALUES
           (@id, @seq, @created_at, @kind, @actor, @run_id, @conversation_id, @tool, @decision,
            @reason_code, @policy_hash, @binding_json, @outcome, @prev_hash, @hash)`,
      ).run(row);
      return row;
    },

    /** 链尾（seq 最大的一条）；空账本返回 null */
    tail(): AuditChainTail | null {
      const row = db
        .prepare('SELECT seq, hash FROM audit_events ORDER BY seq DESC LIMIT 1')
        .get() as AuditChainTail | undefined;
      return row ?? null;
    },

    get(id: string): AuditEventRow | null {
      return (
        (db.prepare('SELECT * FROM audit_events WHERE id = ?').get(id) as
          | AuditEventRow
          | undefined) ?? null
      );
    },

    /** 页面列表：按 seq 倒序，cursor 为上一页最小 seq */
    list(filter: AuditEventListFilter = {}): AuditEventRow[] {
      const where: string[] = [];
      if (filter.from) where.push('created_at >= @from');
      if (filter.to) where.push('created_at <= @to');
      if (filter.kind) where.push('kind = @kind');
      if (filter.runId) where.push('run_id = @runId');
      if (filter.afterSeq !== undefined) where.push('seq < @afterSeq');
      const sql = `SELECT * FROM audit_events${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
        ORDER BY seq DESC LIMIT @limit`;
      return db
        .prepare(sql)
        .all({
          from: filter.from ?? null,
          to: filter.to ?? null,
          kind: filter.kind ?? null,
          runId: filter.runId ?? null,
          afterSeq: filter.afterSeq ?? null,
          limit: Math.min(Math.max(filter.limit ?? 50, 1), 200),
        }) as AuditEventRow[];
    },

    /** 校验 / 导出：按 seq 升序取一批 */
    listAscending(afterSeq = 0, limit = 500): AuditEventRow[] {
      return db
        .prepare('SELECT * FROM audit_events WHERE seq > ? ORDER BY seq ASC LIMIT ?')
        .all(afterSeq, Math.min(Math.max(limit, 1), 1000)) as AuditEventRow[];
    },

    /** v2.15：按 created_at 闭区间升序取一批（归档用） */
    listRangeAscending(filter: AuditRangeFilter): AuditEventRow[] {
      return db
        .prepare(
          `SELECT * FROM audit_events
           WHERE created_at >= @from AND created_at <= @to AND seq > @afterSeq
           ORDER BY seq ASC LIMIT @limit`,
        )
        .all({
          from: filter.from,
          to: filter.to,
          afterSeq: filter.afterSeq ?? 0,
          limit: Math.min(Math.max(filter.limit ?? 500, 1), 1000),
        }) as AuditEventRow[];
    },

    /** v2.15：区间事件计数（锚点重新计数用） */
    countRange(from: string, to: string): number {
      const row = db
        .prepare('SELECT COUNT(*) AS n FROM audit_events WHERE created_at >= ? AND created_at <= ?')
        .get(from, to) as { n: number };
      return row.n;
    },

    /** v2.15：按 seq 取单条（锚点逐点校验用） */
    getBySeq(seq: number): AuditEventRow | null {
      return (
        (db.prepare('SELECT * FROM audit_events WHERE seq = ?').get(seq) as
          | AuditEventRow
          | undefined) ?? null
      );
    },

    count(): number {
      const row = db.prepare('SELECT COUNT(*) AS n FROM audit_events').get() as { n: number };
      return row.n;
    },
  };
}

export type AuditEventRepository = ReturnType<typeof createAuditEventRepository>;
