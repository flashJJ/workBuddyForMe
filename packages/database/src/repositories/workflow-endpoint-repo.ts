import type {
  FlowEndpointStatus,
  FlowUnattendedPolicy,
  WorkflowEndpointView,
} from '@wbfm/shared/types';
import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';

export interface WorkflowEndpointRow {
  id: string;
  workflow_id: string;
  key_hash: string;
  key_prefix: string;
  http_enabled: number;
  mcp_enabled: number;
  sync_timeout_ms: number;
  rate_limit_per_min: number;
  policy_mode: string;
  policy_allowed_tools_json: string;
  policy_revalidation_required: number;
  status: string;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 建端点/重置密钥时的入库字段（密钥生成与哈希在 core endpoint-service 完成） */
export interface EndpointUpsertFields {
  workflowId: string;
  keyHash: string;
  keyPrefix: string;
  httpEnabled?: boolean;
  mcpEnabled?: boolean;
  syncTimeoutMs?: number;
  rateLimitPerMin?: number;
  policy?: FlowUnattendedPolicy;
}

export interface EndpointConfigPatch {
  httpEnabled?: boolean;
  mcpEnabled?: boolean;
  syncTimeoutMs?: number;
  rateLimitPerMin?: number;
  policy?: FlowUnattendedPolicy;
  policyRevalidationRequired?: boolean;
}

function mapRow(row: WorkflowEndpointRow): WorkflowEndpointView {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    keyPrefix: row.key_prefix,
    httpEnabled: row.http_enabled === 1,
    mcpEnabled: row.mcp_enabled === 1,
    syncTimeoutMs: row.sync_timeout_ms,
    rateLimitPerMin: row.rate_limit_per_min,
    policy:
      row.policy_mode === 'allowlist'
        ? {
            mode: 'allowlist',
            allowed: (() => {
              try {
                return JSON.parse(row.policy_allowed_tools_json) as string[];
              } catch {
                return [];
              }
            })(),
          }
        : { mode: 'deny_all' },
    policyRevalidationRequired: row.policy_revalidation_required === 1,
    status: row.status as FlowEndpointStatus,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function policyColumns(policy: FlowUnattendedPolicy) {
  return {
    policyMode: policy.mode,
    policyAllowed: JSON.stringify(policy.mode === 'allowlist' ? policy.allowed : []),
  };
}

export function createWorkflowEndpointRepository(db: DatabaseInstance) {
  return {
    /** 新建端点（一流程一行；重复 workflow_id 由 UNIQUE 约束兜底） */
    create(fields: EndpointUpsertFields): WorkflowEndpointView {
      const id = newId();
      const ts = nowIso();
      const policy = fields.policy ?? { mode: 'deny_all' as const };
      const pc = policyColumns(policy);
      db.prepare(
        `INSERT INTO workflow_endpoints
           (id, workflow_id, key_hash, key_prefix, http_enabled, mcp_enabled,
            sync_timeout_ms, rate_limit_per_min, policy_mode, policy_allowed_tools_json,
            policy_revalidation_required, status, last_used_at, created_at, updated_at)
         VALUES
           (@id, @workflowId, @keyHash, @keyPrefix, @httpEnabled, @mcpEnabled,
            @syncTimeoutMs, @rateLimitPerMin, @policyMode, @policyAllowed,
            0, 'enabled', NULL, @ts, @ts)`,
      ).run({
        id,
        workflowId: fields.workflowId,
        keyHash: fields.keyHash,
        keyPrefix: fields.keyPrefix,
        httpEnabled: fields.httpEnabled ? 1 : 0,
        mcpEnabled: fields.mcpEnabled ? 1 : 0,
        syncTimeoutMs: fields.syncTimeoutMs ?? 60_000,
        rateLimitPerMin: fields.rateLimitPerMin ?? 30,
        policyMode: pc.policyMode,
        policyAllowed: pc.policyAllowed,
        ts,
      });
      return mapRow(this.getRowById(id)!);
    },

    /** 重置密钥（hash/prefix 更新，开关与策略不变） */
    rotateKey(id: string, keyHash: string, keyPrefix: string): WorkflowEndpointView | null {
      const result = db
        .prepare(
          `UPDATE workflow_endpoints SET key_hash = @keyHash, key_prefix = @keyPrefix,
             updated_at = @ts WHERE id = @id`,
        )
        .run({ keyHash, keyPrefix, ts: nowIso(), id });
      if (result.changes === 0) return null;
      return mapRow(this.getRowById(id)!);
    },

    updateConfig(id: string, patch: EndpointConfigPatch): WorkflowEndpointView | null {
      const row = this.getRowById(id);
      if (!row) return null;
      const current = mapRow(row);
      const pc = patch.policy ? policyColumns(patch.policy) : null;
      db.prepare(
        `UPDATE workflow_endpoints SET
           http_enabled = @httpEnabled,
           mcp_enabled = @mcpEnabled,
           sync_timeout_ms = @syncTimeoutMs,
           rate_limit_per_min = @rateLimitPerMin,
           policy_mode = @policyMode,
           policy_allowed_tools_json = @policyAllowed,
           policy_revalidation_required = @revalidation,
           updated_at = @ts
         WHERE id = @id`,
      ).run({
        httpEnabled: (patch.httpEnabled ?? current.httpEnabled) ? 1 : 0,
        mcpEnabled: (patch.mcpEnabled ?? current.mcpEnabled) ? 1 : 0,
        syncTimeoutMs: patch.syncTimeoutMs ?? current.syncTimeoutMs,
        rateLimitPerMin: patch.rateLimitPerMin ?? current.rateLimitPerMin,
        policyMode: pc?.policyMode ?? current.policy.mode,
        policyAllowed: pc?.policyAllowed ?? JSON.stringify(
          current.policy.mode === 'allowlist' ? current.policy.allowed : [],
        ),
        revalidation: (patch.policyRevalidationRequired ?? current.policyRevalidationRequired) ? 1 : 0,
        ts: nowIso(),
        id,
      });
      return mapRow(this.getRowById(id)!);
    },

    setStatus(id: string, status: FlowEndpointStatus): WorkflowEndpointView | null {
      const result = db
        .prepare(`UPDATE workflow_endpoints SET status = @status, updated_at = @ts WHERE id = @id`)
        .run({ status, ts: nowIso(), id });
      return result.changes === 0 ? null : mapRow(this.getRowById(id)!);
    },

    setRevalidation(id: string, required: boolean): void {
      db.prepare(
        `UPDATE workflow_endpoints SET policy_revalidation_required = @required, updated_at = @ts
         WHERE id = @id`,
      ).run({ required: required ? 1 : 0, ts: nowIso(), id });
    },

    touchLastUsed(id: string): void {
      db.prepare(`UPDATE workflow_endpoints SET last_used_at = @ts WHERE id = @id`).run({
        ts: nowIso(),
        id,
      });
    },

    getRowById(id: string): WorkflowEndpointRow | null {
      return (
        (db.prepare('SELECT * FROM workflow_endpoints WHERE id = ?').get(id) as
          | WorkflowEndpointRow
          | undefined) ?? null
      );
    },

    getById(id: string): WorkflowEndpointView | null {
      const row = this.getRowById(id);
      return row ? mapRow(row) : null;
    },

    getByWorkflowId(workflowId: string): WorkflowEndpointView | null {
      const row = db
        .prepare('SELECT * FROM workflow_endpoints WHERE workflow_id = ?')
        .get(workflowId) as WorkflowEndpointRow | undefined;
      return row ? mapRow(row) : null;
    },

    /** 鉴权用：按 key_hash 取原始行（含 status/开关），命中后由 service 判定可用性 */
    getRowByKeyHash(keyHash: string): WorkflowEndpointRow | null {
      return (
        (db.prepare('SELECT * FROM workflow_endpoints WHERE key_hash = ?').get(keyHash) as
          | WorkflowEndpointRow
          | undefined) ?? null
      );
    },

    /** MCP tools/list：所有启用 MCP 暴露且端点启用的流程 id */
    listMcpEnabledWorkflowIds(limit = 100): string[] {
      const rows = db
        .prepare(
          `SELECT workflow_id FROM workflow_endpoints
           WHERE mcp_enabled = 1 AND status = 'enabled' ORDER BY created_at LIMIT ?`,
        )
        .all(limit) as { workflow_id: string }[];
      return rows.map((r) => r.workflow_id);
    },
  };
}

export type WorkflowEndpointRepository = ReturnType<typeof createWorkflowEndpointRepository>;
