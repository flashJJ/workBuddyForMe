import type {
  FlowNodeExecStatus,
  FlowRunStatus,
  FlowTrigger,
  NodeExecutionView,
  WorkflowRunView,
} from '@wbfm/shared';
import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';

export interface WorkflowRunRow {
  id: string;
  workflow_id: string;
  version: number;
  trigger: string;
  status: string;
  input_json: string | null;
  output_json: string | null;
  error_json: string | null;
  conversation_id: string | null;
  wait_node_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface NodeExecutionRow {
  id: string;
  run_id: string;
  node_id: string;
  status: string;
  inputs_json: string | null;
  outputs_json: string | null;
  error_json: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number;
}

export interface WorkflowRunCreateFields {
  id?: string;
  workflowId: string;
  version: number;
  trigger?: FlowTrigger;
  input?: Record<string, unknown>;
  conversationId?: string | null;
}

export type RunTerminalStatus = Extract<FlowRunStatus, 'succeeded' | 'failed' | 'cancelled'>;

export interface RunFinishFields {
  output?: unknown;
  error?: { code: string; message: string; nodeId?: string };
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw === null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapRun(row: WorkflowRunRow): WorkflowRunView {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    version: row.version,
    trigger: row.trigger as FlowTrigger,
    status: row.status as FlowRunStatus,
    input: parseJson<Record<string, unknown> | null>(row.input_json, null),
    output: parseJson<unknown>(row.output_json, null),
    error: parseJson<WorkflowRunView['error']>(row.error_json, null),
    conversationId: row.conversation_id,
    waitNodeId: row.wait_node_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  };
}

function mapNode(row: NodeExecutionRow): NodeExecutionView {
  return {
    id: row.id,
    runId: row.run_id,
    nodeId: row.node_id,
    status: row.status as FlowNodeExecStatus,
    inputs: parseJson<unknown>(row.inputs_json, null),
    outputs: parseJson<unknown>(row.outputs_json, null),
    error: row.error_json,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
  };
}

export function createWorkflowRunRepository(db: DatabaseInstance) {
  return {
    /* ---------------- runs ---------------- */

    createRun(fields: WorkflowRunCreateFields): WorkflowRunView {
      const id = fields.id ?? newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO workflow_runs
           (id, workflow_id, version, trigger, status, input_json, output_json, error_json,
            conversation_id, wait_node_id, started_at, finished_at, created_at)
         VALUES
           (@id, @workflowId, @version, @trigger, 'queued', @inputJson, NULL, NULL,
            @conversationId, NULL, NULL, NULL, @ts)`,
      ).run({
        id,
        workflowId: fields.workflowId,
        version: fields.version,
        trigger: fields.trigger ?? 'manual',
        inputJson: fields.input === undefined ? null : JSON.stringify(fields.input),
        conversationId: fields.conversationId ?? null,
        ts,
      });
      return mapRun(this.getRunRow(id)!);
    },

    getRunRow(id: string): WorkflowRunRow | null {
      return (
        (db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(id) as
          | WorkflowRunRow
          | undefined) ?? null
      );
    },

    getRun(id: string): WorkflowRunView | null {
      const row = this.getRunRow(id);
      return row ? mapRun(row) : null;
    },

    listRunsByWorkflow(workflowId: string, limit = 50): WorkflowRunView[] {
      const rows = db
        .prepare('SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(workflowId, limit) as WorkflowRunRow[];
      return rows.map(mapRun);
    },

    /** 最近一次进入终态的运行完成时间（列表卡片用；无运行记录为 null） */
    getLatestFinishedAt(workflowId: string): string | null {
      const row = db
        .prepare(
          `SELECT finished_at FROM workflow_runs
           WHERE workflow_id = ? AND finished_at IS NOT NULL
           ORDER BY finished_at DESC LIMIT 1`,
        )
        .get(workflowId) as { finished_at: string | null } | undefined;
      return row?.finished_at ?? null;
    },

    /** queued → running，写 started_at */
    startRun(id: string): WorkflowRunView | null {
      if (!this.getRunRow(id)) return null;
      db.prepare(
        `UPDATE workflow_runs SET status = 'running', started_at = COALESCE(started_at, @ts)
         WHERE id = @id`,
      ).run({ ts: nowIso(), id });
      return mapRun(this.getRunRow(id)!);
    },

    /** 进入人工挂起，记录等待节点（v0.9 跨进程恢复依据） */
    markWaitingHuman(id: string, nodeId: string): WorkflowRunView | null {
      if (!this.getRunRow(id)) return null;
      db.prepare(
        `UPDATE workflow_runs SET status = 'waiting_human', wait_node_id = @nodeId
         WHERE id = @id`,
      ).run({ nodeId, id });
      return mapRun(this.getRunRow(id)!);
    },

    /** 终态推进：succeeded/failed/cancelled，写 finished_at 与输出/错误 */
    finishRun(id: string, status: RunTerminalStatus, fields: RunFinishFields = {}): WorkflowRunView | null {
      if (!this.getRunRow(id)) return null;
      const errorJson =
        fields.error === undefined ? null : JSON.stringify(fields.error);
      db.prepare(
        `UPDATE workflow_runs
         SET status = @status,
             output_json = @outputJson,
             error_json = @errorJson,
             finished_at = @ts
         WHERE id = @id`,
      ).run({
        status,
        outputJson: fields.output === undefined ? null : JSON.stringify(fields.output),
        errorJson,
        ts: nowIso(),
        id,
      });
      return mapRun(this.getRunRow(id)!);
    },

    /* ---------------- node executions ---------------- */

    /** 节点开始：running + started_at + 解析后入参 */
    addNodeExecution(
      runId: string,
      nodeId: string,
      inputs?: unknown,
    ): NodeExecutionView {
      const id = newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO node_executions
           (id, run_id, node_id, status, inputs_json, outputs_json, error_json,
            started_at, finished_at, duration_ms)
         VALUES
           (@id, @runId, @nodeId, 'running', @inputsJson, NULL, NULL, @ts, NULL, 0)`,
      ).run({
        id,
        runId,
        nodeId,
        inputsJson: inputs === undefined ? null : JSON.stringify(inputs),
        ts,
      });
      return mapNode(this.getNodeRow(id)!);
    },

    getNodeRow(id: string): NodeExecutionRow | null {
      return (
        (db.prepare('SELECT * FROM node_executions WHERE id = ?').get(id) as
          | NodeExecutionRow
          | undefined) ?? null
      );
    },

    /**
     * 节点终态：succeeded/failed/skipped，写 finished_at 并按 started_at 计算耗时；
     * skipped 允许没有 started_at（分支剪枝），耗时记 0。
     */
    finishNodeExecution(
      nodeExecutionId: string,
      status: Extract<FlowNodeExecStatus, 'succeeded' | 'failed' | 'skipped'>,
      fields: { outputs?: unknown; error?: string } = {},
    ): NodeExecutionView | null {
      const row = this.getNodeRow(nodeExecutionId);
      if (!row) return null;
      const ts = nowIso();
      const durationMs = row.started_at
        ? Math.max(0, Date.parse(ts) - Date.parse(row.started_at))
        : 0;
      db.prepare(
        `UPDATE node_executions
         SET status = @status, outputs_json = @outputsJson, error_json = @error,
             finished_at = @ts, duration_ms = @durationMs
         WHERE id = @id`,
      ).run({
        status,
        outputsJson: fields.outputs === undefined ? row.outputs_json : JSON.stringify(fields.outputs),
        error: fields.error ?? '',
        ts,
        durationMs,
        id: nodeExecutionId,
      });
      return mapNode(this.getNodeRow(nodeExecutionId)!);
    },

    listNodeExecutions(runId: string): NodeExecutionView[] {
      const rows = db
        .prepare('SELECT * FROM node_executions WHERE run_id = ? ORDER BY started_at ASC, rowid ASC')
        .all(runId) as NodeExecutionRow[];
      return rows.map(mapNode);
    },
  };
}

export type WorkflowRunRepository = ReturnType<typeof createWorkflowRunRepository>;
