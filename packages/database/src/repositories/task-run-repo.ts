import type {
  TaskRunStatus,
  TaskRunView,
  TaskStepView,
  TaskStopReason,
} from '@wbfm/shared/schemas';
import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';
import {
  mapTaskStep,
  type TaskStepAddFields,
  type TaskStepFinishFields,
  type TaskStepRow,
} from './task-run-types';

export type { TaskStepAddFields, TaskStepFinishFields } from './task-run-types';

export interface TaskRunRow {
  id: string;
  /** v020 起可空（无会话入口） */
  conversation_id: string | null;
  assistant_id: string;
  goal: string;
  status: string;
  step_count: number;
  failure_count: number;
  max_steps: number;
  stop_reason: string | null;
  agent_run_id: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface TaskRunCreateFields {
  id?: string;
  conversationId: string | null;
  assistantId: string;
  goal: string;
  maxSteps: number;
  agentRunId?: string | null;
}

function mapRun(row: TaskRunRow): TaskRunView {
  return {
    id: row.id,
    conversationId: row.conversation_id ?? '',
    assistantId: row.assistant_id,
    goal: row.goal,
    status: row.status as TaskRunStatus,
    stepCount: row.step_count,
    failureCount: row.failure_count,
    maxSteps: row.max_steps,
    stopReason: (row.stop_reason as TaskStopReason | null) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  };
}

export function createTaskRunRepository(db: DatabaseInstance) {
  return {
    /* ---------------- runs ---------------- */

    createRun(fields: TaskRunCreateFields): TaskRunView {
      const id = fields.id ?? newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO task_runs
           (id, conversation_id, assistant_id, goal, status, step_count, failure_count,
            max_steps, stop_reason, agent_run_id, created_at, updated_at, finished_at)
         VALUES
           (@id, @conversationId, @assistantId, @goal, 'queued', 0, 0,
            @maxSteps, NULL, @agentRunId, @ts, @ts, NULL)`,
      ).run({
        id,
        conversationId: fields.conversationId,
        assistantId: fields.assistantId,
        goal: fields.goal,
        maxSteps: fields.maxSteps,
        agentRunId: fields.agentRunId ?? null,
        ts: nowIso(),
      });
      return mapRun(this.getRunRow(id)!);
    },

    getRun(id: string): TaskRunView | null {
      const row = this.getRunRow(id);
      return row ? mapRun(row) : null;
    },

    getRunRow(id: string): TaskRunRow | null {
      return (
        (db.prepare('SELECT * FROM task_runs WHERE id = ?').get(id) as TaskRunRow | undefined) ??
        null
      );
    },

    listRunsByConversation(conversationId: string, limit = 20): TaskRunView[] {
      const rows = db
        .prepare(
          'SELECT * FROM task_runs WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?',
        )
        .all(conversationId, limit) as TaskRunRow[];
      return rows.map(mapRun);
    },

    /** 跨会话列出最近运行（任务面板总览；默认按创建时间倒序） */
    listAllRuns(limit = 100): TaskRunView[] {
      const rows = db
        .prepare('SELECT * FROM task_runs ORDER BY created_at DESC LIMIT ?')
        .all(limit) as TaskRunRow[];
      return rows.map(mapRun);
    },

    /** v2.8：列出非终态运行（重启恢复扫描用） */
    listNonTerminalRuns(): TaskRunView[] {
      const rows = db
        .prepare(
          `SELECT * FROM task_runs WHERE status IN ('queued','running','paused')
           ORDER BY created_at ASC`,
        )
        .all() as TaskRunRow[];
      return rows.map(mapRun);
    },

    /** v2.8：写作业租约（owner + 到期时刻） */
    setLease(id: string, owner: string, expiresAt: string): void {
      db.prepare(
        'UPDATE task_runs SET lease_owner = ?, lease_expires_at = ?, updated_at = ? WHERE id = ?',
      ).run(owner, expiresAt, nowIso(), id);
    },

    /** v2.8：终态/异常释放租约 */
    clearLease(id: string): void {
      db.prepare(
        'UPDATE task_runs SET lease_owner = NULL, lease_expires_at = NULL WHERE id = ?',
      ).run(id);
    },

    /** 状态机推进；终态（completed/failed/stopped）自动写 finished_at 与 stop_reason */
    updateRunStatus(id: string, status: TaskRunStatus, stopReason?: TaskStopReason): TaskRunView | null {
      const row = this.getRunRow(id);
      if (!row) return null;
      const terminal = status === 'completed' || status === 'failed' || status === 'stopped';
      db.prepare(
        `UPDATE task_runs
         SET status = @status,
             stop_reason = @stopReason,
             updated_at = @ts,
             finished_at = @finishedAt
         WHERE id = @id`,
      ).run({
        id,
        status,
        stopReason: terminal ? (stopReason ?? null) : row.stop_reason,
        ts: nowIso(),
        finishedAt: terminal ? nowIso() : row.finished_at,
      });
      return mapRun(this.getRunRow(id)!);
    },

    /** 步数 +1（失败步同时失败计数 +1）；返回更新后的运行 */
    incrementRunCounters(id: string, opts: { failed?: boolean } = {}): TaskRunView | null {
      const row = this.getRunRow(id);
      if (!row) return null;
      db.prepare(
        `UPDATE task_runs
         SET step_count = step_count + 1,
             failure_count = failure_count + @failed,
             updated_at = @ts
         WHERE id = @id`,
      ).run({ id, failed: opts.failed ? 1 : 0, ts: nowIso() });
      return mapRun(this.getRunRow(id)!);
    },

    /* ---------------- steps ---------------- */

    addStep(fields: TaskStepAddFields): TaskStepView {
      const id = fields.id ?? newId();
      db.prepare(
        `INSERT INTO task_steps
           (id, run_id, step_index, kind, tool_name, reason, args_json, result_json,
            screenshot_path, status, error, duration_ms, created_at)
         VALUES
           (@id, @runId, @stepIndex, @kind, @toolName, @reason, @argsJson, '',
            @screenshotPath, 'running', '', 0, @ts)`,
      ).run({
        id,
        runId: fields.runId,
        stepIndex: fields.stepIndex,
        kind: fields.kind,
        toolName: fields.toolName ?? null,
        reason: fields.reason ?? '',
        argsJson: fields.argsJson ?? '',
        screenshotPath: fields.screenshotPath ?? '',
        ts: nowIso(),
      });
      return mapTaskStep(this.getStepRow(id)!);
    },

    finishStep(id: string, fields: TaskStepFinishFields): TaskStepView | null {
      const row = this.getStepRow(id);
      if (!row) return null;
      db.prepare(
        `UPDATE task_steps
         SET status = @status, result_json = @resultJson, error = @error,
             duration_ms = @durationMs, screenshot_path = @screenshotPath,
             citations_json = @citationsJson
         WHERE id = @id`,
      ).run({
        id,
        status: fields.status,
        resultJson: fields.resultJson ?? row.result_json,
        error: fields.error ?? row.error,
        durationMs: fields.durationMs ?? row.duration_ms,
        screenshotPath: fields.screenshotPath ?? row.screenshot_path,
        citationsJson:
          fields.citations !== undefined ? JSON.stringify(fields.citations) : row.citations_json,
      });
      return mapTaskStep(this.getStepRow(id)!);
    },

    getStepRow(id: string): TaskStepRow | null {
      return (
        (db.prepare('SELECT * FROM task_steps WHERE id = ?').get(id) as TaskStepRow | undefined) ??
        null
      );
    },

    listSteps(runId: string): TaskStepView[] {
      const rows = db
        .prepare('SELECT * FROM task_steps WHERE run_id = ? ORDER BY step_index ASC')
        .all(runId) as TaskStepRow[];
      return rows.map(mapTaskStep);
    },
  };
}

export type TaskRunRepository = ReturnType<typeof createTaskRunRepository>;
