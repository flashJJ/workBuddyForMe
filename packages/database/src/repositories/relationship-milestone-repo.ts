import type { DatabaseInstance } from '../client';
import {
  relationshipMilestoneRecordSchema,
  type RelationshipMilestoneRecord,
} from '@wbfm/shared/schemas';

/** 共同里程碑表行 */
export interface RelationshipMilestoneRow {
  id: string;
  assistant_id: string;
  milestone_key: string;
  achieved_at: string;
  payload_json: string;
}

/** 里程碑统计输入（只读聚合，不新埋执行链路；见 05 §2.1） */
export interface RelationshipMilestoneStats {
  /** 最早一条正向互动（praise/chat/comfort）的 ISO 时间；从未互动为 null */
  firstPositiveEventAt: string | null;
  /** 该助手 done 的协作运行累计数 */
  collabDoneCount: number;
}

export interface AchieveMilestoneInput {
  assistantId: string;
  milestoneKey: string;
  achievedAt: string;
  payload?: Record<string, unknown>;
}

function mapRow(row: RelationshipMilestoneRow): RelationshipMilestoneRecord | null {
  let payload: unknown = {};
  try {
    payload = JSON.parse(row.payload_json || '{}');
  } catch {
    payload = {};
  }
  const result = relationshipMilestoneRecordSchema.safeParse({
    id: row.id,
    assistantId: row.assistant_id,
    milestoneKey: row.milestone_key,
    achievedAt: row.achieved_at,
    payload,
  });
  return result.success ? result.data : null;
}

/**
 * v2.0 M2 共同里程碑仓储：
 * - 达成记录以 (assistant_id, milestone_key) 唯一索引幂等；
 * - 统计只读 emotion_events / agent_runs，不依赖新埋点。
 */
export function createRelationshipMilestoneRepository(db: DatabaseInstance) {
  return {
    /** 幂等写入达成事实；已存在（含备份恢复的旧行）返回 false，不覆盖时间 */
    achieve(input: AchieveMilestoneInput): RelationshipMilestoneRecord | null {
      const id = `milestone:${input.assistantId}:${input.milestoneKey}`;
      const result = db
        .prepare(
          `INSERT OR IGNORE INTO relationship_milestones
             (id, assistant_id, milestone_key, achieved_at, payload_json)
           VALUES (@id, @assistantId, @milestoneKey, @achievedAt, @payloadJson)`,
        )
        .run({
          id,
          assistantId: input.assistantId,
          milestoneKey: input.milestoneKey,
          achievedAt: input.achievedAt,
          payloadJson: JSON.stringify(input.payload ?? {}),
        });
      if (result.changes === 0) return null;
      return this.findByAssistant(input.assistantId).find(
        (m) => m.milestoneKey === input.milestoneKey,
      ) ?? null;
    },

    findByAssistant(assistantId: string): RelationshipMilestoneRecord[] {
      const rows = db
        .prepare(
          `SELECT id, assistant_id, milestone_key, achieved_at, payload_json
             FROM relationship_milestones WHERE assistant_id = ?
             ORDER BY achieved_at ASC, milestone_key ASC`,
        )
        .all(assistantId) as RelationshipMilestoneRow[];
      return rows.map(mapRow).filter((m): m is RelationshipMilestoneRecord => m !== null);
    },

    listAll(): RelationshipMilestoneRecord[] {
      const rows = db
        .prepare(
          `SELECT id, assistant_id, milestone_key, achieved_at, payload_json
             FROM relationship_milestones ORDER BY achieved_at ASC`,
        )
        .all() as RelationshipMilestoneRow[];
      return rows.map(mapRow).filter((m): m is RelationshipMilestoneRecord => m !== null);
    },

    /** 全表涉及的助手 id（每日检查点扫描范围；级联删除已处理助手消失） */
    listAssistantIds(): string[] {
      const rows = db
        .prepare(`SELECT DISTINCT assistant_id AS id FROM relationship_milestones`)
        .all() as Array<{ id: string }>;
      return rows.map((r) => r.id);
    },

    deleteByAssistant(assistantId: string): number {
      return db
        .prepare(`DELETE FROM relationship_milestones WHERE assistant_id = ?`)
        .run(assistantId).changes;
    },

    /** 统计：最早正向互动时间（level_* 系统事件不计入） */
    statsFor(assistantId: string): RelationshipMilestoneStats {
      const first = db
        .prepare(
          `SELECT MIN(created_at) AS at FROM emotion_events
             WHERE assistant_id = ? AND type IN ('praise', 'chat', 'comfort')`,
        )
        .get(assistantId) as { at: string | null } | undefined;
      const collab = db
        .prepare(
          `SELECT COUNT(*) AS n FROM agent_runs
             WHERE assistant_id = ? AND status = 'done'`,
        )
        .get(assistantId) as { n: number } | undefined;
      return {
        firstPositiveEventAt: first?.at ?? null,
        collabDoneCount: collab?.n ?? 0,
      };
    },
  };
}

export type RelationshipMilestoneRepository = ReturnType<
  typeof createRelationshipMilestoneRepository
>;
