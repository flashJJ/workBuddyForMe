import type {
  TaskRunStatus,
  TaskRunView,
  TaskStepKind,
  TaskStepStatus,
  TaskStepView,
  TaskStopReason,
} from '@wbfm/shared';
import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';

export interface TaskRunRow {
  id: string;
  conversation_id: string;
  assistant_id: string;
  goal: string;
  status: string;
  step_count: number;
  failure_count: number;
  max_steps: number;
  stop_reason: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface TaskStepRow {
  id: string;
  run_id: string;
  step_index: number;
  kind: string;
  tool_name: string | null;
  reason: string;
  args_json: string;
  result_json: string;
  screenshot_path: string;
  status: string;
  error: string;
  duration_ms: number;
  created_at: string;
}

export interface TaskRunCreateFields {
  id?: string;
  conversationId: string;
  assistantId: string;
  goal: string;
  maxSteps: number;
}

export interface TaskStepAddFields {
  id?: string;
  runId: string;
  stepIndex: number;
  kind: TaskStepKind;
  toolName?: string | null;
  reason?: string;
  argsJson?: string;
  screenshotPath?: string;
}

export interface TaskStepFinishFields {
  status: Exclude<TaskStepStatus, 'running'>;
  resultJson?: string;
  error?: string;
  durationMs?: number;
  /** M3-2：观察步截图附件 id（截图落盘在步完成后才可知） */
  screenshotPath?: string;
}

function mapRun(row: TaskRunRow): TaskRunView {
  return {
    id: row.id,
    conversationId: row.conversation_id,
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

function mapStep(row: TaskStepRow): TaskStepView {
  return {
    id: row.id,
    runId: row.run_id,
    stepIndex: row.step_index,
    kind: row.kind as TaskStepKind,
    toolName: row.tool_name,
    reason: row.reason,
    argsJson: row.args_json,
    resultJson: row.result_json,
    screenshotPath: row.screenshot_path,
    status: row.status as TaskStepStatus,
    error: row.error,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
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
            max_steps, stop_reason, created_at, updated_at, finished_at)
         VALUES
           (@id, @conversationId, @assistantId, @goal, 'queued', 0, 0,
            @maxSteps, NULL, @ts, @ts, NULL)`,
      ).run({
        id,
        conversationId: fields.conversationId,
        assistantId: fields.assistantId,
        goal: fields.goal,
        maxSteps: fields.maxSteps,
        ts,
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
      return mapStep(this.getStepRow(id)!);
    },

    finishStep(id: string, fields: TaskStepFinishFields): TaskStepView | null {
      const row = this.getStepRow(id);
      if (!row) return null;
      db.prepare(
        `UPDATE task_steps
         SET status = @status, result_json = @resultJson, error = @error,
             duration_ms = @durationMs, screenshot_path = @screenshotPath
         WHERE id = @id`,
      ).run({
        id,
        status: fields.status,
        resultJson: fields.resultJson ?? row.result_json,
        error: fields.error ?? row.error,
        durationMs: fields.durationMs ?? row.duration_ms,
        screenshotPath: fields.screenshotPath ?? row.screenshot_path,
      });
      return mapStep(this.getStepRow(id)!);
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
      return rows.map(mapStep);
    },
  };
}

export type TaskRunRepository = ReturnType<typeof createTaskRunRepository>;
