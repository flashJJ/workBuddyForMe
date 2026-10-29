import type {
  ConversationGoalView,
  GoalStatus,
  WorkPlanStatus,
  WorkPlanStepView,
  WorkPlanView,
  WorkStepStatus,
} from '@wbfm/shared/schemas';
import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';
import {
  mapGoal,
  mapPlan,
  mapStep,
  type GoalRow,
  type PlanCreateFields,
  type PlanRow,
  type PlanStepRow,
  type StepInput,
} from './work-plan-repo-types';

export type {
  GoalRow,
  PlanCreateFields,
  PlanRow,
  PlanStepRow,
  StepInput,
} from './work-plan-repo-types';

export function createWorkPlanRepository(db: DatabaseInstance) {
  const listSteps = (planId: string): PlanStepRow[] =>
    db
      .prepare('SELECT * FROM work_plan_steps WHERE plan_id = ? ORDER BY step_index ASC')
      .all(planId) as PlanStepRow[];

  return {
    /* ---------------- goals ---------------- */

    createGoal(fields: { conversationId: string; title: string; successCriteria?: string }): ConversationGoalView {
      const id = newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO conversation_goals(id, conversation_id, title, success_criteria, status, created_at, updated_at)
         VALUES (@id, @conversationId, @title, @criteria, 'active', @ts, @ts)`,
      ).run({
        id,
        conversationId: fields.conversationId,
        title: fields.title,
        criteria: fields.successCriteria ?? '',
        ts,
      });
      return this.getGoal(id)!;
    },

    getGoal(id: string): ConversationGoalView | null {
      const row = db.prepare('SELECT * FROM conversation_goals WHERE id = ?').get(id) as
        | GoalRow
        | undefined;
      return row ? mapGoal(row) : null;
    },

    listGoals(conversationId: string): ConversationGoalView[] {
      const rows = db
        .prepare(
          'SELECT * FROM conversation_goals WHERE conversation_id = ? ORDER BY created_at DESC',
        )
        .all(conversationId) as GoalRow[];
      return rows.map(mapGoal);
    },

    updateGoal(
      id: string,
      patch: { title?: string; successCriteria?: string; status?: GoalStatus },
    ): ConversationGoalView | null {
      const row = db.prepare('SELECT * FROM conversation_goals WHERE id = ?').get(id) as
        | GoalRow
        | undefined;
      if (!row) return null;
      db.prepare(
        `UPDATE conversation_goals
         SET title = @title, success_criteria = @criteria, status = @status, updated_at = @ts
         WHERE id = @id`,
      ).run({
        id,
        title: patch.title ?? row.title,
        criteria: patch.successCriteria ?? row.success_criteria,
        status: patch.status ?? row.status,
        ts: nowIso(),
      });
      return this.getGoal(id);
    },

    deleteGoal(id: string): boolean {
      return db.prepare('DELETE FROM conversation_goals WHERE id = ?').run(id).changes > 0;
    },

    /* ---------------- plans ---------------- */

    createPlan(fields: PlanCreateFields): WorkPlanView {
      const id = newId();
      const ts = nowIso();
      return db.transaction(() => {
        db.prepare(
          `INSERT INTO work_plans(id, conversation_id, goal_id, kind, title, status, origin, created_at, updated_at, approved_at)
           VALUES (@id, @conversationId, @goalId, @kind, @title, @status, @origin, @ts, @ts, NULL)`,
        ).run({
          id,
          conversationId: fields.conversationId,
          goalId: fields.goalId ?? null,
          kind: fields.kind,
          title: fields.title,
          status: fields.status,
          origin: fields.origin,
          ts,
        });
        fields.steps.forEach((step, index) => {
          db.prepare(
            `INSERT INTO work_plan_steps(id, plan_id, step_index, title, status, note, updated_at)
             VALUES (@id, @planId, @index, @title, @status, @note, @ts)`,
          ).run({
            id: newId(),
            planId: id,
            index,
            title: step.title,
            status: step.status ?? 'pending',
            note: step.note ?? '',
            ts,
          });
        });
        return this.getPlan(id)!;
      })();
    },

    getPlan(id: string): WorkPlanView | null {
      const row = db.prepare('SELECT * FROM work_plans WHERE id = ?').get(id) as PlanRow | undefined;
      return row ? mapPlan(row, listSteps(id)) : null;
    },

    listPlans(conversationId?: string): WorkPlanView[] {
      const rows = (
        conversationId
          ? db
              .prepare(
                'SELECT * FROM work_plans WHERE conversation_id = ? ORDER BY created_at DESC',
              )
              .all(conversationId)
          : db.prepare('SELECT * FROM work_plans ORDER BY created_at DESC LIMIT 200').all()
      ) as PlanRow[];
      return rows.map((row) => mapPlan(row, listSteps(row.id)));
    },

    /** 最新一个非终态 todo 清单（todo_write 复用；无则返回 null） */
    findActiveTodo(conversationId: string): WorkPlanView | null {
      const row = db
        .prepare(
          `SELECT * FROM work_plans
           WHERE conversation_id = ? AND kind = 'todo' AND status NOT IN ('abandoned','rejected')
           ORDER BY created_at DESC LIMIT 1`,
        )
        .get(conversationId) as PlanRow | undefined;
      return row ? mapPlan(row, listSteps(row.id)) : null;
    },

    updatePlan(id: string, patch: { title?: string; status?: WorkPlanStatus; approvedAt?: string | null }): WorkPlanView | null {
      const row = db.prepare('SELECT * FROM work_plans WHERE id = ?').get(id) as PlanRow | undefined;
      if (!row) return null;
      db.prepare(
        `UPDATE work_plans
         SET title = @title, status = @status, approved_at = @approvedAt, updated_at = @ts
         WHERE id = @id`,
      ).run({
        id,
        title: patch.title ?? row.title,
        status: patch.status ?? row.status,
        approvedAt: patch.approvedAt !== undefined ? patch.approvedAt : row.approved_at,
        ts: nowIso(),
      });
      return this.getPlan(id);
    },

    /** 全量替换步骤：带 id 保留原位更新，未带 id 新增，缺失删除；step_index 重排 */
    replaceSteps(planId: string, steps: StepInput[]): WorkPlanView | null {
      const row = db.prepare('SELECT * FROM work_plans WHERE id = ?').get(planId) as
        | PlanRow
        | undefined;
      if (!row) return null;
      const ts = nowIso();
      return db.transaction(() => {
        const existing = listSteps(planId);
        const keepIds = new Set(steps.map((step) => step.id).filter(Boolean) as string[]);
        for (const old of existing) {
          if (!keepIds.has(old.id)) {
            db.prepare('DELETE FROM work_plan_steps WHERE id = ?').run(old.id);
          }
        }
        steps.forEach((step, index) => {
          const old = step.id ? existing.find((item) => item.id === step.id) : undefined;
          if (old) {
            db.prepare(
              `UPDATE work_plan_steps
               SET step_index = @index, title = @title, status = @status, note = @note, updated_at = @ts
               WHERE id = @id`,
            ).run({
              id: old.id,
              index,
              title: step.title,
              status: step.status ?? old.status,
              note: step.note ?? old.note,
              ts,
            });
          } else {
            db.prepare(
              `INSERT INTO work_plan_steps(id, plan_id, step_index, title, status, note, updated_at)
               VALUES (@id, @planId, @index, @title, @status, @note, @ts)`,
            ).run({
              id: newId(),
              planId,
              index,
              title: step.title,
              status: step.status ?? 'pending',
              note: step.note ?? '',
              ts,
            });
          }
        });
        db.prepare('UPDATE work_plans SET updated_at = @ts WHERE id = @id').run({ id: planId, ts });
        return this.getPlan(planId);
      })();
    },

    updateStep(
      planId: string,
      stepId: string,
      patch: { status?: WorkStepStatus; note?: string },
    ): WorkPlanStepView | null {
      const row = db
        .prepare('SELECT * FROM work_plan_steps WHERE id = ? AND plan_id = ?')
        .get(stepId, planId) as PlanStepRow | undefined;
      if (!row) return null;
      db.prepare(
        `UPDATE work_plan_steps SET status = @status, note = @note, updated_at = @ts WHERE id = @id`,
      ).run({
        id: stepId,
        status: patch.status ?? row.status,
        note: patch.note ?? row.note,
        ts: nowIso(),
      });
      db.prepare('UPDATE work_plans SET updated_at = @ts WHERE id = @id').run({
        id: planId,
        ts: nowIso(),
      });
      const updated = db.prepare('SELECT * FROM work_plan_steps WHERE id = ?').get(stepId) as PlanStepRow;
      return mapStep(updated);
    },

    deletePlan(id: string): boolean {
      return db.transaction(() => {
        db.prepare('DELETE FROM work_plan_steps WHERE plan_id = ?').run(id);
        return db.prepare('DELETE FROM work_plans WHERE id = ?').run(id).changes > 0;
      })();
    },

    /** 完成回投幂等：首次插入返回 true */
    claimCompletion(runId: string, kind: string, status: string): boolean {
      const result = db
        .prepare(
          `INSERT OR IGNORE INTO run_completions(run_id, kind, status, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(runId, kind, status, nowIso());
      return result.changes > 0;
    },
  };
}

export type WorkPlanRepository = ReturnType<typeof createWorkPlanRepository>;
