import type { DatabaseInstance } from '../../client';
import type { WorkflowRunRow } from './workflow-run-types';
import { mapRun } from './workflow-run-mapper';

/**
 * v5.0：终态运行清理查询/删除。
 * 从 workflow-run-repo 拆出以控行数；列投影由调用方传入，避免读取图快照大字段。
 */
export function createWorkflowRunRetentionStore(db: DatabaseInstance, columns: string) {
  return {
    /** 清理候选：按完成时间（缺省创建时间）早于截止 */
    listTerminalBefore(cutoffIso: string, limit = 200) {
      const rows = db
        .prepare(
          `SELECT ${columns} FROM workflow_runs
           WHERE status IN ('succeeded','failed','cancelled','interrupted')
             AND COALESCE(finished_at, created_at) < ?
           ORDER BY COALESCE(finished_at, created_at) ASC LIMIT ?`,
        )
        .all(cutoffIso, limit) as WorkflowRunRow[];
      return rows.map(mapRun);
    },

    /** 每流程保留 N 条终态运行，返回超出的最旧行 */
    listTerminalBeyondPerWorkflow(workflowId: string, keep: number) {
      const rows = db
        .prepare(
          `SELECT ${columns} FROM workflow_runs
           WHERE workflow_id = ?
             AND status IN ('succeeded','failed','cancelled','interrupted')
           ORDER BY COALESCE(finished_at, created_at) DESC
           LIMIT -1 OFFSET ?`,
        )
        .all(workflowId, Math.max(0, keep)) as WorkflowRunRow[];
      return rows.map(mapRun);
    },

    /** 删除终态运行（node_executions 级联），返回删除数 */
    deleteRuns(runIds: string[]): number {
      if (runIds.length === 0) return 0;
      const stmt = db.prepare(
        `DELETE FROM workflow_runs
         WHERE id = ? AND status IN ('succeeded','failed','cancelled','interrupted')`,
      );
      let removed = 0;
      const tx = db.transaction((ids: string[]) => {
        for (const id of ids) removed += stmt.run(id).changes;
      });
      tx(runIds);
      return removed;
    },
  };
}
