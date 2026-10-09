import type { FlowNodeExecStatus, NodeExecutionView } from '@wbfm/shared/types';
import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';
import type { NodeExecutionRow } from './workflow-run-repo';

function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw === null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function mapNodeExecution(row: NodeExecutionRow): NodeExecutionView {
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

/**
 * 节点执行记录存储（v0.8 起；v0.9 从 workflow-run-repo 拆出以控文件规模）。
 * 与 run 仓储组合为同一对象对外暴露，调用方无感知。
 */
export function createNodeExecutionStore(db: DatabaseInstance) {
  return {
    /** 节点开始：running + started_at + 解析后入参 */
    addNodeExecution(runId: string, nodeId: string, inputs?: unknown): NodeExecutionView {
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
      const row = db.prepare('SELECT * FROM node_executions WHERE id = ?').get(id) as NodeExecutionRow;
      return mapNodeExecution(row);
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
      const row = db.prepare('SELECT * FROM node_executions WHERE id = ?').get(
        nodeExecutionId,
      ) as NodeExecutionRow | undefined;
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
      const updated = db.prepare('SELECT * FROM node_executions WHERE id = ?').get(
        nodeExecutionId,
      ) as NodeExecutionRow;
      return mapNodeExecution(updated);
    },

    listNodeExecutions(runId: string): NodeExecutionView[] {
      const rows = db
        .prepare('SELECT * FROM node_executions WHERE run_id = ? ORDER BY started_at ASC, rowid ASC')
        .all(runId) as NodeExecutionRow[];
      return rows.map(mapNodeExecution);
    },
  };
}

export type NodeExecutionStore = ReturnType<typeof createNodeExecutionStore>;
