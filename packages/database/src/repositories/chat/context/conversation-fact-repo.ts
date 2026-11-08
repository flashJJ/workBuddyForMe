import { createHash } from 'node:crypto';
import type { ConversationFact, ConversationFactKind } from '@wbfm/shared/types';
import type { SummaryPayload } from '@wbfm/shared/schemas';
import type { DatabaseInstance } from '../../../client';
import { nowIso } from '../../ops/mappers';

/**
 * v2.26 P1 会话结构化事实仓储：
 * - 主键 (conversation_id, kind, key) 唯一，重复抽取走 upsert；
 * - checksum 相同视为未变化，不写库；
 * - 决策/未决问题以内容指纹作为 key，跨多次压缩天然去重。
 */

export interface FactUpsertInput {
  kind: ConversationFactKind;
  key: string;
  value: string;
  unit: string | null;
  validFrom: string | null;
}

interface FactRow {
  id: number;
  conversation_id: string;
  kind: ConversationFactKind;
  key: string;
  value: string;
  unit: string | null;
  valid_from: string | null;
  source_message_ids: string | null;
  checksum: string;
  created_at: string;
  updated_at: string;
}

export interface FactUpsertStats {
  inserted: number;
  updated: number;
  unchanged: number;
}

function mapFact(row: FactRow): ConversationFact {
  let ids: string[] = [];
  if (row.source_message_ids) {
    try {
      const parsed: unknown = JSON.parse(row.source_message_ids);
      if (Array.isArray(parsed)) ids = parsed.filter((id): id is string => typeof id === 'string');
    } catch {
      ids = [];
    }
  }
  return {
    id: String(row.id),
    conversationId: row.conversation_id,
    kind: row.kind,
    key: row.key,
    value: row.value,
    unit: row.unit,
    validFrom: row.valid_from,
    sourceMessageIds: ids,
    checksum: row.checksum,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 内容指纹：同 kind/key 下值变化才会触发更新 */
function checksumOf(input: FactUpsertInput): string {
  return createHash('sha256')
    .update(`${input.kind}|${input.key}|${input.value}|${input.unit ?? ''}|${input.validFrom ?? ''}`)
    .digest('hex');
}

/** 决策/未决问题的稳定键：内容指纹前 12 位 */
function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

/** 摘要器载荷转事实写入项（facts + decisions + open_loops 三类落同一表） */
export function payloadToFactInputs(payload: SummaryPayload): FactUpsertInput[] {
  return [
    ...payload.facts.map((fact) => ({
      kind: 'fact' as const,
      key: fact.key,
      value: fact.value,
      unit: fact.unit,
      validFrom: fact.validFrom,
    })),
    ...payload.decisions.map((value) => ({
      kind: 'decision' as const,
      key: `decision:${fingerprint(value)}`,
      value,
      unit: null,
      validFrom: null,
    })),
    ...payload.openLoops.map((value) => ({
      kind: 'open_loop' as const,
      key: `open_loop:${fingerprint(value)}`,
      value,
      unit: null,
      validFrom: null,
    })),
  ];
}

export function createConversationFactRepository(db: DatabaseInstance) {
  return {
    listByConversation(conversationId: string, limit = 100): ConversationFact[] {
      const rows = db
        .prepare(
          `SELECT * FROM conversation_facts WHERE conversation_id = ?
           ORDER BY updated_at DESC, id DESC LIMIT ?`,
        )
        .all(conversationId, limit) as FactRow[];
      return rows.map(mapFact);
    },

    /** 幂等写入；返回新增/更新/未变化计数（未变化不触碰 updated_at） */
    upsertMany(
      conversationId: string,
      inputs: readonly FactUpsertInput[],
      sourceMessageIds: readonly string[],
    ): FactUpsertStats {
      const stats: FactUpsertStats = { inserted: 0, updated: 0, unchanged: 0 };
      if (inputs.length === 0) return stats;
      const find = db.prepare(
        `SELECT id, checksum FROM conversation_facts WHERE conversation_id = ? AND kind = ? AND key = ?`,
      );
      const insert = db.prepare(
        `INSERT INTO conversation_facts(
           conversation_id, kind, key, value, unit, valid_from, source_message_ids, checksum, created_at, updated_at
         ) VALUES (@conversationId, @kind, @key, @value, @unit, @validFrom, @sourceIds, @checksum, @ts, @ts)`,
      );
      const update = db.prepare(
        `UPDATE conversation_facts
            SET value = @value, unit = @unit, valid_from = @validFrom,
                source_message_ids = @sourceIds, checksum = @checksum, updated_at = @ts
          WHERE id = @id`,
      );
      const sourceIds = JSON.stringify(sourceMessageIds);
      const ts = nowIso();
      db.transaction(() => {
        for (const input of inputs) {
          const checksum = checksumOf(input);
          const existing = find.get(conversationId, input.kind, input.key) as
            | { id: number; checksum: string }
            | undefined;
          if (!existing) {
            insert.run({
              conversationId,
              kind: input.kind,
              key: input.key,
              value: input.value,
              unit: input.unit,
              validFrom: input.validFrom,
              sourceIds,
              checksum,
              ts,
            });
            stats.inserted += 1;
            continue;
          }
          if (existing.checksum === checksum) {
            stats.unchanged += 1;
            continue;
          }
          update.run({
            id: existing.id,
            value: input.value,
            unit: input.unit,
            validFrom: input.validFrom,
            sourceIds,
            checksum,
            ts,
          });
          stats.updated += 1;
        }
      })();
      return stats;
    },

    /** 摘要器输出统一落库（facts/decisions/open_loops） */
    upsertPayload(
      conversationId: string,
      payload: SummaryPayload,
      sourceMessageIds: readonly string[],
    ): FactUpsertStats {
      return this.upsertMany(conversationId, payloadToFactInputs(payload), sourceMessageIds);
    },

    deleteByConversation(conversationId: string): number {
      return db
        .prepare(`DELETE FROM conversation_facts WHERE conversation_id = ?`)
        .run(conversationId).changes;
    },
  };
}

export type ConversationFactRepository = ReturnType<typeof createConversationFactRepository>;
