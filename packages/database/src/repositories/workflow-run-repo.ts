import type {
  FlowRunStatus,
  FlowTrigger,
  NodeExecutionView,
  WorkflowRunView,
} from '@wbfm/shared';
import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';
import { createNodeExecutionStore } from './node-execution-repo';

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
  endpoint_id: string | null;
  parent_run_id: string | null;
  resumed_from_node: string | null;
  interrupt_reason: string | null;
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
  /** v0.9：API/MCP 触发来源端点 */
  endpointId?: string | null;
  /** v0.9：重放关联 */
  parentRunId?: string | null;
  resumedFromNode?: string | null;
}

export type RunTerminalStatus = Extract<
  FlowRunStatus,
  'succeeded' | 'failed' | 'cancelled' | 'interrupted'
>;

export interface RunFinishFields {
  output?: unknown;
  error?: { code: string; message: string; nodeId?: string };
}

export interface RunListFilter {
  trigger?: FlowTrigger;
  status?: FlowRunStatus;
  endpointId?: string;
  limit?: number;
}

/** v0.9：启动恢复扫描结果 */
export interface RecoverableRuns {
  /** queued 无执行者：重新入队的 runId */
  queued: string[];
  /** running/waiting_human 无执行者：需收敛 interrupted 的 runId */
  interrupted: string[];
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
    endpointId: row.endpoint_id,
    parentRunId: row.parent_run_id,
    resumedFromNode: row.resumed_from_node,
    interruptReason: row.interrupt_reason,
  };
}

export function createWorkflowRunRepository(db: DatabaseInstance) {
  const nodeStore = createNodeExecutionStore(db);

  return {
    /* ---------------- 节点执行（组合自 node-execution-repo） ---------------- */
    ...nodeStore,

    /* ---------------- runs ---------------- */

    createRun(fields: WorkflowRunCreateFields): WorkflowRunView {
      const id = fields.id ?? newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO workflow_runs
           (id, workflow_id, version, trigger, status, input_json, output_json, error_json,
            conversation_id, wait_node_id, started_at, finished_at, created_at,
            endpoint_id, parent_run_id, resumed_from_node, interrupt_reason)
         VALUES
           (@id, @workflowId, @version, @trigger, 'queued', @inputJson, NULL, NULL,
            @conversationId, NULL, NULL, NULL, @ts,
            @endpointId, @parentRunId, @resumedFromNode, NULL)`,
      ).run({
        id,
        workflowId: fields.workflowId,
        version: fields.version,
        trigger: fields.trigger ?? 'manual',
        inputJson: fields.input === undefined ? null : JSON.stringify(fields.input),
        conversationId: fields.conversationId ?? null,
        endpointId: fields.endpointId ?? null,
        parentRunId: fields.parentRunId ?? null,
        resumedFromNode: fields.resumedFromNode ?? null,
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

    /** v0.9：跨工作流运行记录（运行中心筛选）；至少一个过滤项或显式 limit */
    listRuns(filter: RunListFilter = {}): WorkflowRunView[] {
      const where: string[] = [];
      const params: Record<string, unknown> = {};
      if (filter.trigger) {
        where.push('trigger = @trigger');
        params.trigger = filter.trigger;
      }
      if (filter.status) {
        where.push('status = @status');
        params.status = filter.status;
      }
      if (filter.endpointId) {
        where.push('endpoint_id = @endpointId');
        params.endpointId = filter.endpointId;
      }
      const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const limit = Math.min(filter.limit ?? 100, 200);
      const rows = db
        .prepare(`SELECT * FROM workflow_runs ${clause} ORDER BY created_at DESC LIMIT ${limit}`)
        .all(params) as WorkflowRunRow[];
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

    /**
     * v0.9：队列原子认领——仅当 run 仍为 queued 时置 running。
     * 返回 true 表示当前调用者抢到执行权（防内存信号重复/多 tick 双跑）。
     */
    claimQueued(id: string): boolean {
      const ts = nowIso();
      const result = db
        .prepare(
          `UPDATE workflow_runs SET status = 'running', started_at = COALESCE(started_at, @ts)
           WHERE id = @id AND status = 'queued'`,
        )
        .run({ id, ts });
      return result.changes === 1;
    },

    /** queued → running，写 started_at（兼容非队列路径；新代码优先 claimQueued） */
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

    /** v0.9：进程重启时把在途运行收敛为 interrupted（终态）；非在途状态返回 null */
    markInterrupted(id: string, reason: string): WorkflowRunView | null {
      const result = db
        .prepare(
          `UPDATE workflow_runs
           SET status = 'interrupted', interrupt_reason = @reason,
               finished_at = COALESCE(finished_at, @ts)
           WHERE id = @id AND status IN ('running', 'waiting_human')`,
        )
        .run({ id, reason, ts: nowIso() });
      return result.changes === 0 ? null : mapRun(this.getRunRow(id)!);
    },

    /** 终态推进：succeeded/failed/cancelled/interrupted，写 finished_at 与输出/错误 */
    finishRun(
      id: string,
      status: RunTerminalStatus,
      fields: RunFinishFields = {},
    ): WorkflowRunView | null {
      if (!this.getRunRow(id)) return null;
      const errorJson = fields.error === undefined ? null : JSON.stringify(fields.error);
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

    /** v0.9：启动恢复扫描；activeIds 为当前进程内存里仍有执行者的 run（不收敛） */
    findRecoverableRuns(activeIds: ReadonlySet<string>): RecoverableRuns {
      const rows = db
        .prepare(`SELECT id, status FROM workflow_runs WHERE status IN ('queued','running','waiting_human')`)
        .all() as { id: string; status: string }[];
      const result: RecoverableRuns = { queued: [], interrupted: [] };
      for (const row of rows) {
        if (activeIds.has(row.id)) continue;
        if (row.status === 'queued') result.queued.push(row.id);
        else result.interrupted.push(row.id);
      }
      return result;
    },
  };
}

export type WorkflowRunRepository = ReturnType<typeof createWorkflowRunRepository>;
export type { NodeExecutionView };
