import type {
  FlowFileTriggerConfig,
  FlowTriggerKind,
  FlowTriggerLastStatus,
  FlowTriggerView,
  FlowWebhookAuthMode,
} from '@wbfm/shared/types';
import type { DatabaseInstance } from '../../client';
import { newId, nowIso } from '../ops/mappers';

/**
 * v4.25：流程事件触发器仓储。
 * Webhook 只存 secret 哈希；文件配置序列化在 config_json。
 */

const WEBHOOK_PREFIX = '/api/public/flows/triggers';

export interface WorkflowTriggerRow {
  id: string;
  workflow_id: string;
  kind: string;
  name: string;
  enabled: number;
  config_json: string;
  secret_hash: string | null;
  secret_cipher: string | null;
  last_fired_at: string | null;
  last_run_id: string | null;
  last_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface TriggerCreateFields {
  workflowId: string;
  kind: FlowTriggerKind;
  name: string;
  config: FlowFileTriggerConfig | null;
  secretHash?: string | null;
  secretCipher?: string | null;
  authMode?: FlowWebhookAuthMode;
}

export interface TriggerUpdateFields {
  name?: string;
  enabled?: boolean;
  config?: FlowFileTriggerConfig;
  authMode?: FlowWebhookAuthMode;
}

export interface TriggerOutcome {
  lastFiredAt: string;
  lastRunId?: string | null;
  lastStatus: FlowTriggerLastStatus;
}

function parseConfig(kind: string, raw: string): FlowFileTriggerConfig | null {
  if (kind !== 'file') return null;
  try {
    return JSON.parse(raw) as FlowFileTriggerConfig;
  } catch {
    return null;
  }
}

function parseAuthMode(kind: string, raw: string): FlowWebhookAuthMode | null {
  if (kind !== 'webhook') return null;
  try {
    const parsed = JSON.parse(raw) as { authMode?: unknown };
    if (parsed.authMode === 'hmac' || parsed.authMode === 'both') return parsed.authMode;
  } catch {
    /* 旧空配置按 bearer */
  }
  return 'bearer';
}

function nextConfigJson(existing: WorkflowTriggerRow, fields: TriggerUpdateFields): string {
  if (existing.kind === 'file') {
    return fields.config === undefined ? existing.config_json : JSON.stringify(fields.config);
  }
  if (fields.authMode === undefined) return existing.config_json;
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(existing.config_json) as Record<string, unknown>;
  } catch {
    /* 旧空配置 */
  }
  return JSON.stringify({ ...parsed, authMode: fields.authMode });
}

function mapTrigger(row: WorkflowTriggerRow): FlowTriggerView {
  const kind = row.kind as FlowTriggerKind;
  return {
    id: row.id,
    workflowId: row.workflow_id,
    kind,
    name: row.name,
    enabled: row.enabled === 1,
    config: parseConfig(row.kind, row.config_json),
    webhookPath: kind === 'webhook' ? `${WEBHOOK_PREFIX}/${row.id}` : null,
    authMode: parseAuthMode(row.kind, row.config_json),
    hasSigningSecret: Boolean(row.secret_cipher),
    lastFiredAt: row.last_fired_at,
    lastRunId: row.last_run_id,
    lastStatus: (row.last_status as FlowTriggerLastStatus | null) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createWorkflowTriggerRepository(db: DatabaseInstance) {
  function getRow(id: string): WorkflowTriggerRow | null {
    return (
      (db.prepare('SELECT * FROM workflow_triggers WHERE id = ?').get(id) as
        | WorkflowTriggerRow
        | undefined) ?? null
    );
  }

  return {
    getById(id: string): FlowTriggerView | null {
      const row = getRow(id);
      return row ? mapTrigger(row) : null;
    },

    /** 鉴权专用：只取哈希，不构造视图 */
    getSecretHash(id: string): string | null {
      return getRow(id)?.secret_hash ?? null;
    },

    listByWorkflow(workflowId: string): FlowTriggerView[] {
      const rows = db
        .prepare('SELECT * FROM workflow_triggers WHERE workflow_id = ? ORDER BY created_at ASC')
        .all(workflowId) as WorkflowTriggerRow[];
      return rows.map(mapTrigger);
    },

    listEnabledByKind(kind: FlowTriggerKind): FlowTriggerView[] {
      const rows = db
        .prepare(
          'SELECT * FROM workflow_triggers WHERE kind = ? AND enabled = 1 ORDER BY created_at ASC',
        )
        .all(kind) as WorkflowTriggerRow[];
      return rows.map(mapTrigger);
    },

    /** v5.0：健康面板跨流程列出 */
    listAll(limit = 200): FlowTriggerView[] {
      const rows = db
        .prepare('SELECT * FROM workflow_triggers ORDER BY created_at DESC LIMIT ?')
        .all(limit) as WorkflowTriggerRow[];
      return rows.map(mapTrigger);
    },

    countByWorkflow(workflowId: string, kind: FlowTriggerKind): number {
      const row = db
        .prepare('SELECT COUNT(*) AS n FROM workflow_triggers WHERE workflow_id = ? AND kind = ?')
        .get(workflowId, kind) as { n: number };
      return row.n;
    },

    create(fields: TriggerCreateFields): FlowTriggerView {
      const id = newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO workflow_triggers
           (id, workflow_id, kind, name, enabled, config_json, secret_hash, secret_cipher,
            last_fired_at, last_run_id, last_status, created_at, updated_at)
         VALUES
           (@id, @workflowId, @kind, @name, 1, @configJson, @secretHash, @secretCipher,
            NULL, NULL, NULL, @ts, @ts)`,
      ).run({
        id,
        workflowId: fields.workflowId,
        kind: fields.kind,
        name: fields.name,
        configJson: JSON.stringify(
          fields.kind === 'webhook'
            ? { authMode: fields.authMode ?? 'bearer' }
            : (fields.config ?? {}),
        ),
        secretHash: fields.secretHash ?? null,
        secretCipher: fields.secretCipher ?? null,
        ts,
      });
      return mapTrigger(getRow(id)!);
    },

    update(id: string, fields: TriggerUpdateFields): FlowTriggerView | null {
      const existing = getRow(id);
      if (!existing) return null;
      const ts = nowIso();
      db.prepare(
        `UPDATE workflow_triggers
         SET name = @name, enabled = @enabled, config_json = @configJson, updated_at = @ts
         WHERE id = @id`,
      ).run({
        id,
        name: fields.name ?? existing.name,
        enabled: fields.enabled === undefined ? existing.enabled : fields.enabled ? 1 : 0,
        configJson: nextConfigJson(existing, fields),
        ts,
      });
      return mapTrigger(getRow(id)!);
    },

    remove(id: string): boolean {
      return db.prepare('DELETE FROM workflow_triggers WHERE id = ?').run(id).changes > 0;
    },

    /** v4.26：只替换哈希，触发器 id / URL 不变（保留旧调用；新代码用 setSecret） */
    rotateSecret(id: string, secretHash: string): FlowTriggerView | null {
      const result = db
        .prepare(
          `UPDATE workflow_triggers
           SET secret_hash = @secretHash, updated_at = @ts
           WHERE id = @id AND kind = 'webhook'`,
        )
        .run({ id, secretHash, ts: nowIso() });
      if (result.changes !== 1) return null;
      return mapTrigger(getRow(id)!);
    },

    /** v5.0：同时更新哈希与密文（HMAC 验签需要解密密钥） */
    setSecret(
      id: string,
      fields: { secretHash: string; secretCipher: string },
    ): FlowTriggerView | null {
      const result = db
        .prepare(
          `UPDATE workflow_triggers
           SET secret_hash = @secretHash, secret_cipher = @secretCipher, updated_at = @ts
           WHERE id = @id AND kind = 'webhook'`,
        )
        .run({ id, secretHash: fields.secretHash, secretCipher: fields.secretCipher, ts: nowIso() });
      if (result.changes !== 1) return null;
      return mapTrigger(getRow(id)!);
    },

    getSecretCipher(id: string): string | null {
      return getRow(id)?.secret_cipher ?? null;
    },

    recordOutcome(id: string, outcome: TriggerOutcome): void {
      db.prepare(
        `UPDATE workflow_triggers
         SET last_fired_at = @lastFiredAt, last_run_id = @lastRunId,
             last_status = @lastStatus, updated_at = @ts
         WHERE id = @id`,
      ).run({
        id,
        lastFiredAt: outcome.lastFiredAt,
        lastRunId: outcome.lastRunId ?? null,
        lastStatus: outcome.lastStatus,
        ts: nowIso(),
      });
    },
  };
}

export type WorkflowTriggerRepository = ReturnType<typeof createWorkflowTriggerRepository>;
