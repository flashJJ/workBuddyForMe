import type {
  TaskCheckpoint,
  TaskCheckpointStatus,
  TaskCheckpointTodo,
} from '@wbfm/shared/types';
import type { DatabaseInstance } from '../../../client';
import { newId, nowIso } from '../../ops/mappers';

/**
 * v2.26 P1 工作记忆检查点仓储：
 * - 每个会话最多一个 active 检查点（再次保存覆盖同一行）；
 * - expires_at 到期后由 expireDue 归档为 expired；
 * - 任务完成/放弃时由上层置为 done/archived，历史行保留不删除。
 */

interface CheckpointRow {
  id: string;
  conversation_id: string;
  task_run_id: string | null;
  status: TaskCheckpointStatus;
  goal: string | null;
  plan: string | null;
  todos_json: string | null;
  last_tool_summary: string | null;
  next_step: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckpointSaveInput {
  conversationId: string;
  taskRunId?: string | null;
  goal: string | null;
  plan: string | null;
  todos: TaskCheckpointTodo[];
  lastToolSummary: string | null;
  nextStep: string | null;
  expiresAt: string | null;
}

function parseTodos(raw: string | null): TaskCheckpointTodo[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TaskCheckpointTodo =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as TaskCheckpointTodo).title === 'string',
    );
  } catch {
    return [];
  }
}

function mapCheckpoint(row: CheckpointRow): TaskCheckpoint {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    taskRunId: row.task_run_id,
    status: row.status,
    goal: row.goal,
    plan: row.plan,
    todos: parseTodos(row.todos_json),
    lastToolSummary: row.last_tool_summary,
    nextStep: row.next_step,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createTaskCheckpointRepository(db: DatabaseInstance) {
  return {
    /** 取未过期的活跃检查点（同一会话只保留一个） */
    findActive(conversationId: string, now = nowIso()): TaskCheckpoint | null {
      const row = db
        .prepare(
          `SELECT * FROM task_checkpoints
            WHERE conversation_id = ? AND status = 'active'
              AND (expires_at IS NULL OR expires_at > ?)
            ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(conversationId, now) as CheckpointRow | undefined;
      return row ? mapCheckpoint(row) : null;
    },

    /** 保存快照：已有 active 行（即使已过期）复用该行，否则新建 */
    save(input: CheckpointSaveInput): TaskCheckpoint {
      const ts = nowIso();
      const todosJson = JSON.stringify(input.todos);
      const existing = db
        .prepare(
          `SELECT id FROM task_checkpoints
            WHERE conversation_id = ? AND status = 'active'
            ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(input.conversationId) as { id: string } | undefined;
      const id = existing?.id ?? newId();
      if (existing) {
        db.prepare(
          `UPDATE task_checkpoints
              SET task_run_id = @taskRunId, goal = @goal, plan = @plan, todos_json = @todosJson,
                  last_tool_summary = @lastToolSummary, next_step = @nextStep,
                  expires_at = @expiresAt, updated_at = @ts
            WHERE id = @id`,
        ).run({
          id,
          taskRunId: input.taskRunId ?? null,
          goal: input.goal,
          plan: input.plan,
          todosJson,
          lastToolSummary: input.lastToolSummary,
          nextStep: input.nextStep,
          expiresAt: input.expiresAt,
          ts,
        });
      } else {
        db.prepare(
          `INSERT INTO task_checkpoints(
             id, conversation_id, task_run_id, status, goal, plan, todos_json,
             last_tool_summary, next_step, expires_at, created_at, updated_at
           ) VALUES (@id, @conversationId, @taskRunId, 'active', @goal, @plan, @todosJson,
                     @lastToolSummary, @nextStep, @expiresAt, @ts, @ts)`,
        ).run({
          id,
          conversationId: input.conversationId,
          taskRunId: input.taskRunId ?? null,
          goal: input.goal,
          plan: input.plan,
          todosJson,
          lastToolSummary: input.lastToolSummary,
          nextStep: input.nextStep,
          expiresAt: input.expiresAt,
          ts,
        });
      }
      const row = db.prepare(`SELECT * FROM task_checkpoints WHERE id = ?`).get(id) as CheckpointRow;
      return mapCheckpoint(row);
    },

    /** 结束当前检查点（done/archived）；无 active 行返回 false */
    finish(conversationId: string, status: Extract<TaskCheckpointStatus, 'done' | 'archived'>): boolean {
      return (
        db
          .prepare(
            `UPDATE task_checkpoints SET status = ?, updated_at = ?
              WHERE conversation_id = ? AND status = 'active'`,
          )
          .run(status, nowIso(), conversationId).changes > 0
      );
    },

    /** 过期归档：把到期仍 active 的检查点置为 expired，返回归档条数 */
    expireDue(now = nowIso()): number {
      return db
        .prepare(
          `UPDATE task_checkpoints SET status = 'expired', updated_at = ?
            WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?`,
        )
        .run(now, now).changes;
    },

    deleteByConversation(conversationId: string): number {
      return db
        .prepare(`DELETE FROM task_checkpoints WHERE conversation_id = ?`)
        .run(conversationId).changes;
    },
  };
}

export type TaskCheckpointRepository = ReturnType<typeof createTaskCheckpointRepository>;
