import type { DatabaseInstance } from '../../client';
import type { StagePlan } from '@wbfm/shared/types';
import { stagePlanSchema } from '@wbfm/shared/schemas';
import { nowIso } from '../ops/mappers';

interface StagePlanRow {
  conversation_id: string;
  plan_json: string;
  created_at: string;
  updated_at: string;
}

function parsePlan(value: string): StagePlan | null {
  try {
    const parsed = stagePlanSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * v2.20 会话阶段计划仓储：完整 StagePlan 存 plan_json，activeStep 不单独建列。
 */
export function createStagePlanRepository(db: DatabaseInstance) {
  return {
    get(conversationId: string): StagePlan | null {
      const row = db
        .prepare(`SELECT * FROM conversation_stage_plans WHERE conversation_id = ?`)
        .get(conversationId) as StagePlanRow | undefined;
      return row ? parsePlan(row.plan_json) : null;
    },

    upsert(conversationId: string, plan: StagePlan): StagePlan {
      const ts = nowIso();
      db.prepare(
        `INSERT INTO conversation_stage_plans(conversation_id, plan_json, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(conversation_id) DO UPDATE SET
           plan_json = excluded.plan_json,
           updated_at = excluded.updated_at`,
      ).run(conversationId, JSON.stringify(plan), ts, ts);
      return plan;
    },

    delete(conversationId: string): boolean {
      return db
        .prepare(`DELETE FROM conversation_stage_plans WHERE conversation_id = ?`)
        .run(conversationId).changes > 0;
    },
  };
}

export type StagePlanRepository = ReturnType<typeof createStagePlanRepository>;
