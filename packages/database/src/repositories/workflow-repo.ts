import type { FlowGraph, FlowStatus, WorkflowVersionView, WorkflowView } from '@wbfm/shared';
import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';

export interface WorkflowRow {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: string;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowVersionRow {
  id: string;
  workflow_id: string;
  version: number;
  graph_json: string;
  published_at: string | null;
  created_at: string;
}

export interface WorkflowCreateFields {
  id?: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface WorkflowUpdateFields {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
}

function mapWorkflow(row: WorkflowRow): WorkflowView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    status: row.status as FlowStatus,
    currentVersion: row.current_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersion(row: WorkflowVersionRow): WorkflowVersionView {
  let graph: FlowGraph;
  try {
    graph = JSON.parse(row.graph_json) as FlowGraph;
  } catch {
    // 历史脏数据防御：图损坏时退回空图（详情页可重新保存修复）
    graph = { nodes: [], edges: [] };
  }
  return {
    id: row.id,
    workflowId: row.workflow_id,
    version: row.version,
    graph,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

export function createWorkflowRepository(db: DatabaseInstance) {
  return {
    createWorkflow(fields: WorkflowCreateFields): WorkflowView {
      const id = fields.id ?? newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO workflows
           (id, name, description, icon, color, status, current_version, created_at, updated_at)
         VALUES
           (@id, @name, @description, @icon, @color, 'draft', 0, @ts, @ts)`,
      ).run({
        id,
        name: fields.name,
        description: fields.description ?? '',
        icon: fields.icon ?? 'workflow',
        color: fields.color ?? 'default',
        ts,
      });
      return mapWorkflow(this.getWorkflowRow(id)!);
    },

    getWorkflowRow(id: string): WorkflowRow | null {
      return (
        (db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as WorkflowRow | undefined) ??
        null
      );
    },

    getWorkflow(id: string): WorkflowView | null {
      const row = this.getWorkflowRow(id);
      return row ? mapWorkflow(row) : null;
    },

    listWorkflows(limit = 100): WorkflowView[] {
      const rows = db
        .prepare('SELECT * FROM workflows ORDER BY created_at DESC LIMIT ?')
        .all(limit) as WorkflowRow[];
      return rows.map(mapWorkflow);
    },

    /** 仅更新元信息；改图请走 addVersion */
    updateWorkflow(id: string, fields: WorkflowUpdateFields): WorkflowView | null {
      const row = this.getWorkflowRow(id);
      if (!row) return null;
      db.prepare(
        `UPDATE workflows
         SET name = @name, description = @description, icon = @icon,
             color = @color, updated_at = @ts
         WHERE id = @id`,
      ).run({
        id,
        name: fields.name ?? row.name,
        description: fields.description ?? row.description,
        icon: fields.icon ?? row.icon,
        color: fields.color ?? row.color,
        ts: nowIso(),
      });
      return mapWorkflow(this.getWorkflowRow(id)!);
    },

    setStatus(id: string, status: FlowStatus): WorkflowView | null {
      const row = this.getWorkflowRow(id);
      if (!row) return null;
      db.prepare('UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?').run(
        status,
        nowIso(),
        id,
      );
      return mapWorkflow(this.getWorkflowRow(id)!);
    },

    /**
     * 保存图生成新版本（事务）：版本号在工作流内自增，current_version 跟随；
     * 一旦在已发布版本上再存图，状态回到 draft（有未发布改动）。
     */
    addVersion(workflowId: string, graph: FlowGraph): WorkflowVersionView | null {
      const row = this.getWorkflowRow(workflowId);
      if (!row) return null;
      const id = newId();
      const ts = nowIso();
      const save = db.transaction(() => {
        const maxRow = db
          .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM workflow_versions WHERE workflow_id = ?')
          .get(workflowId) as { v: number };
        const version = maxRow.v + 1;
        db.prepare(
          `INSERT INTO workflow_versions (id, workflow_id, version, graph_json, published_at, created_at)
           VALUES (@id, @workflowId, @version, @graphJson, NULL, @ts)`,
        ).run({ id, workflowId, version, graphJson: JSON.stringify(graph), ts });
        db.prepare(
          `UPDATE workflows SET current_version = @version, status = 'draft', updated_at = @ts
           WHERE id = @workflowId`,
        ).run({ version, ts, workflowId });
      });
      save();
      return this.getVersion(workflowId, this.getWorkflowRow(workflowId)!.current_version)!;
    },

    getVersion(workflowId: string, version: number): WorkflowVersionView | null {
      const row = db
        .prepare('SELECT * FROM workflow_versions WHERE workflow_id = ? AND version = ?')
        .get(workflowId, version) as WorkflowVersionRow | undefined;
      return row ? mapVersion(row) : null;
    },

    /** 当前版本图（无版本时返回 null） */
    getCurrentVersion(workflowId: string): WorkflowVersionView | null {
      const row = this.getWorkflowRow(workflowId);
      if (!row || row.current_version === 0) return null;
      return this.getVersion(workflowId, row.current_version);
    },

    /** 发布指定版本（默认当前版本）：写 published_at 并置 status=published */
    publishVersion(workflowId: string, version?: number): WorkflowView | null {
      const wf = this.getWorkflowRow(workflowId);
      if (!wf) return null;
      const targetVersion = version ?? wf.current_version;
      const publish = db.transaction(() => {
        const result = db
          .prepare(
            `UPDATE workflow_versions SET published_at = ?
             WHERE workflow_id = ? AND version = ? AND published_at IS NULL`,
          )
          .run(nowIso(), workflowId, targetVersion);
        if (result.changes === 0) {
          // 已发布过或版本不存在：仅当版本确实存在时才允许置 published
          const exists = this.getVersion(workflowId, targetVersion);
          if (!exists) throw new Error(`版本不存在：workflow=${workflowId} version=${targetVersion}`);
        }
        db.prepare(
          `UPDATE workflows SET status = 'published', current_version = @v, updated_at = @ts
           WHERE id = @id`,
        ).run({ v: targetVersion, ts: nowIso(), id: workflowId });
      });
      publish();
      return this.getWorkflow(workflowId);
    },

    deleteWorkflow(id: string): void {
      db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
    },
  };
}

export type WorkflowRepository = ReturnType<typeof createWorkflowRepository>;
