import type { FlowGraph } from '@wbfm/shared/schemas';
import type { FlowStatus, WorkflowVersionView, WorkflowView } from '@wbfm/shared/types';
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
  /** v2.14：生产运行版本（NULL=未设置，运行时回退 current_version） */
  published_version: number | null;
  created_at: string;
  updated_at: string;
  origin_capability_id: string | null;
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
  /** v2.11：来源能力包 id（用户自建不传） */
  originCapabilityId?: string | null;
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
    publishedVersion: row.published_version ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    originCapabilityId: row.origin_capability_id ?? null,
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
           (id, name, description, icon, color, status, current_version, created_at, updated_at,
            origin_capability_id)
         VALUES
           (@id, @name, @description, @icon, @color, 'draft', 0, @ts, @ts, @origin)`,
      ).run({
        id,
        name: fields.name,
        description: fields.description ?? '',
        icon: fields.icon ?? 'workflow',
        color: fields.color ?? 'default',
        ts,
        origin: fields.originCapabilityId ?? null,
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

    /** v2.14：生产运行版本；未设置时回退当前草稿版本（兼容历史工作流） */
    getProductionVersion(workflowId: string): WorkflowVersionView | null {
      const row = this.getWorkflowRow(workflowId);
      if (!row) return null;
      const target = row.published_version ?? row.current_version;
      if (target === 0) return null;
      return this.getVersion(workflowId, target);
    },

    /** 版本列表（版本号倒序，供编辑器版本抽屉） */
    listVersions(workflowId: string): WorkflowVersionView[] {
      const rows = db
        .prepare('SELECT * FROM workflow_versions WHERE workflow_id = ? ORDER BY version DESC')
        .all(workflowId) as WorkflowVersionRow[];
      return rows.map(mapVersion);
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
          `UPDATE workflows
           SET status = 'published', current_version = @v, published_version = @v, updated_at = @ts
           WHERE id = @id`,
        ).run({ v: targetVersion, ts: nowIso(), id: workflowId });
      });
      publish();
      return this.getWorkflow(workflowId);
    },

    /**
     * v2.14：只把指定历史版本设为生产，不改变 current_version；
     * 运行 / 端点 / MCP 立即使用该版本，编辑器草稿保持不变。
     */
    setProductionVersion(workflowId: string, version: number): WorkflowView | null {
      const wf = this.getWorkflowRow(workflowId);
      if (!wf) return null;
      if (!this.getVersion(workflowId, version)) {
        throw new Error(`版本不存在：workflow=${workflowId} version=${version}`);
      }
      db.prepare(
        `UPDATE workflows SET published_version = @v, status = 'published', updated_at = @ts
         WHERE id = @id`,
      ).run({ v: version, ts: nowIso(), id: workflowId });
      return this.getWorkflow(workflowId);
    },

    /** v2.12：升级回滚时恢复当前版本（不改发布状态，disabled 场景使用） */
    setCurrentVersion(workflowId: string, version: number): boolean {
      return (
        db
          .prepare('UPDATE workflows SET current_version = ?, updated_at = ? WHERE id = ?')
          .run(version, nowIso(), workflowId).changes > 0
      );
    },

    /** v2.11：按来源能力包查找（停用后再次启用时复用同一工作流） */
    findByOriginCapabilityId(capabilityId: string): WorkflowView | null {
      const row = db
        .prepare(
          'SELECT * FROM workflows WHERE origin_capability_id = ? ORDER BY created_at DESC LIMIT 1',
        )
        .get(capabilityId) as WorkflowRow | undefined;
      return row ? mapWorkflow(row) : null;
    },

    /** v2.11：是否存在运行记录（卸载清理判定） */
    hasRuns(workflowId: string): boolean {
      const row = db
        .prepare('SELECT 1 AS hit FROM workflow_runs WHERE workflow_id = ? LIMIT 1')
        .get(workflowId) as { hit: number } | undefined;
      return Boolean(row);
    },

    /** v2.11：是否被对外端点引用（卸载清理判定） */
    hasEndpoint(workflowId: string): boolean {
      const row = db
        .prepare('SELECT 1 AS hit FROM workflow_endpoints WHERE workflow_id = ? LIMIT 1')
        .get(workflowId) as { hit: number } | undefined;
      return Boolean(row);
    },

    deleteWorkflow(id: string): void {
      db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
    },
  };
}

export type WorkflowRepository = ReturnType<typeof createWorkflowRepository>;
