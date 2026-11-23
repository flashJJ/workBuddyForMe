import { ApiError } from '@wbfm/shared/errors';
import type { FlowFileTriggerConfig, FlowTriggerView } from '@wbfm/shared/types';
import type {
  WorkflowRepository,
  WorkflowRunRepository,
  WorkflowTriggerRepository,
} from '@wbfm/database';
import type { CreateRunParams } from '../run/run-service-types';
import { generateWebhookSecret, hashTriggerSecret, verifyTriggerSecret } from './trigger-auth';
import {
  buildWebhookInput,
  defaultIsDirectory,
  ensurePublished,
  FILE_LIMIT,
  IDEMPOTENCY_MAX,
  IDEMPOTENCY_TTL_MS,
  requireWorkflow,
  validateFileConfig,
  WEBHOOK_LIMIT,
} from './trigger-service-helpers';

/**
 * v4.25 事件触发执行服务：
 * - 配置读写（Webhook / 文件）；
 * - Webhook Secret 鉴权；
 * - 单飞、未发布拒绝、幂等与状态回写。
 * 运行入参约定见 docs/plan/v4.25/contracts.md。
 */

export interface FlowTriggerRunner {
  createRun(params: CreateRunParams): string;
}

export type FireResult =
  | { ok: true; runId: string }
  | { ok: false; reason: 'busy' | 'not_published' | 'duplicate' | 'disabled' | 'error' };

export type WebhookAuthResult =
  | { ok: true; trigger: FlowTriggerView }
  | { ok: false; reason: 'not_found' | 'unauthorized' };

export interface FileTriggerEvent {
  path: string;
  name: string;
  ext: string;
  eventType: 'add' | 'change';
  changedAt: string;
}

export interface FlowTriggerServiceDeps {
  triggers: WorkflowTriggerRepository;
  workflows: WorkflowRepository;
  runs: WorkflowRunRepository;
  flowRunner: FlowTriggerRunner;
  now?: () => Date;
  onChange?: () => void;
  isDirectory?: (path: string) => boolean;
}

export interface FlowTriggerService {
  list(workflowId: string): FlowTriggerView[];
  create(
    workflowId: string,
    input:
      | { kind: 'webhook'; name?: string }
      | { kind: 'file'; name?: string; config: FlowFileTriggerConfig },
  ): { trigger: FlowTriggerView; secret?: string };
  update(
    workflowId: string,
    triggerId: string,
    patch: { name?: string; enabled?: boolean; config?: FlowFileTriggerConfig },
  ): FlowTriggerView;
  remove(workflowId: string, triggerId: string): boolean;
  /** v4.26：轮换 Webhook Secret；新明文仅本次返回 */
  rotateSecret(workflowId: string, triggerId: string): { trigger: FlowTriggerView; secret: string };
  authenticateWebhook(triggerId: string, authorization: string | null): WebhookAuthResult;
  fireWebhook(
    trigger: FlowTriggerView,
    payload: Record<string, unknown>,
    idempotencyKey?: string,
  ): FireResult;
  fireFile(trigger: FlowTriggerView, file: FileTriggerEvent): FireResult;
  /** 监听器无法建立时的状态回写 */
  markError(triggerId: string): void;
}

export function createFlowTriggerService(deps: FlowTriggerServiceDeps): FlowTriggerService {
  const now = deps.now ?? (() => new Date());
  const isDirectory = deps.isDirectory ?? defaultIsDirectory;
  /** 每触发器一份幂等桶：key → 过期时间 */
  const idempotency = new Map<string, Map<string, number>>();

  function triggerOf(workflowId: string, triggerId: string): FlowTriggerView {
    const trigger = deps.triggers.getById(triggerId);
    if (!trigger || trigger.workflowId !== workflowId) {
      throw ApiError.notFound('触发器', triggerId);
    }
    return trigger;
  }

  function ensureEnabledCount(workflowId: string, kind: 'webhook' | 'file'): void {
    const limit = kind === 'webhook' ? WEBHOOK_LIMIT : FILE_LIMIT;
    if (deps.triggers.countByWorkflow(workflowId, kind) >= limit) {
      throw ApiError.conflict(
        kind === 'webhook' ? `每个流程最多 ${limit} 个 Webhook 触发器` : `每个流程最多 ${limit} 个文件触发器`,
      );
    }
  }

  function publishedOf(workflowId: string): boolean {
    const workflow = deps.workflows.getWorkflow(workflowId);
    return Boolean(workflow && workflow.status === 'published' && workflow.publishedVersion !== null);
  }

  function record(id: string, status: 'created' | 'skipped_busy' | 'error', runId?: string): void {
    deps.triggers.recordOutcome(id, {
      lastFiredAt: now().toISOString(),
      lastRunId: runId ?? null,
      lastStatus: status,
    });
  }

  function idempotentHit(triggerId: string, key?: string): boolean {
    if (!key) return false;
    const bucket = idempotency.get(triggerId);
    if (!bucket) return false;
    const expires = bucket.get(key);
    if (expires === undefined) return false;
    if (expires <= now().getTime()) {
      bucket.delete(key);
      return false;
    }
    return true;
  }

  function rememberKey(triggerId: string, key?: string): void {
    if (!key) return;
    let bucket = idempotency.get(triggerId);
    if (!bucket) {
      bucket = new Map();
      idempotency.set(triggerId, bucket);
    }
    bucket.set(key, now().getTime() + IDEMPOTENCY_TTL_MS);
    while (bucket.size > IDEMPOTENCY_MAX) {
      const oldest = bucket.keys().next().value;
      if (oldest === undefined) break;
      bucket.delete(oldest);
    }
  }

  function fire(
    trigger: FlowTriggerView,
    triggerType: 'webhook' | 'file',
    input: Record<string, unknown>,
  ): FireResult {
    const current = deps.triggers.getById(trigger.id);
    if (!current || !current.enabled || current.workflowId !== trigger.workflowId) {
      return { ok: false, reason: 'disabled' };
    }
    if (!publishedOf(current.workflowId)) {
      record(current.id, 'error');
      return { ok: false, reason: 'not_published' };
    }
    if (deps.runs.hasActiveRun(current.workflowId)) {
      record(current.id, 'skipped_busy');
      return { ok: false, reason: 'busy' };
    }
    try {
      const runId = deps.flowRunner.createRun({
        workflowId: current.workflowId,
        trigger: triggerType,
        input,
      });
      record(current.id, 'created', runId);
      return { ok: true, runId };
    } catch {
      record(current.id, 'error');
      return { ok: false, reason: 'error' };
    }
  }

  return {
    list(workflowId) {
      requireWorkflow(deps.workflows, workflowId);
      return deps.triggers.listByWorkflow(workflowId);
    },

    create(workflowId, input) {
      const workflow = requireWorkflow(deps.workflows, workflowId);
      ensurePublished(workflow);
      ensureEnabledCount(workflowId, input.kind);
      const name = input.name?.trim() || (input.kind === 'webhook' ? 'Webhook' : '文件监听');

      if (input.kind === 'webhook') {
        const secret = generateWebhookSecret();
        const trigger = deps.triggers.create({
          workflowId,
          kind: 'webhook',
          name,
          config: null,
          secretHash: hashTriggerSecret(secret),
        });
        deps.onChange?.();
        return { trigger, secret };
      }

      const config = validateFileConfig(input.config, isDirectory);
      const trigger = deps.triggers.create({
        workflowId,
        kind: 'file',
        name,
        config,
      });
      deps.onChange?.();
      return { trigger };
    },

    update(workflowId, triggerId, patch) {
      const trigger = triggerOf(workflowId, triggerId);
      if (trigger.kind === 'webhook' && patch.config !== undefined) {
        throw ApiError.validation('Webhook 触发器不支持修改文件配置');
      }
      if (patch.enabled === true) {
        ensurePublished(requireWorkflow(deps.workflows, workflowId));
      }
      const config =
        patch.config === undefined ? undefined : validateFileConfig(patch.config, isDirectory);
      const updated = deps.triggers.update(triggerId, {
        ...(patch.name === undefined ? {} : { name: patch.name.trim() || trigger.name }),
        ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
        ...(config === undefined ? {} : { config }),
      });
      if (!updated) throw ApiError.notFound('触发器', triggerId);
      deps.onChange?.();
      return updated;
    },

    remove(workflowId, triggerId) {
      triggerOf(workflowId, triggerId);
      const removed = deps.triggers.remove(triggerId);
      if (removed) deps.onChange?.();
      return removed;
    },

    rotateSecret(workflowId, triggerId) {
      const trigger = triggerOf(workflowId, triggerId);
      if (trigger.kind !== 'webhook') {
        throw ApiError.validation('仅 Webhook 触发器支持轮换 Secret');
      }
      const secret = generateWebhookSecret();
      const updated = deps.triggers.rotateSecret(triggerId, hashTriggerSecret(secret));
      if (!updated) throw ApiError.notFound('触发器', triggerId);
      return { trigger: updated, secret };
    },

    authenticateWebhook(triggerId, authorization) {
      const trigger = deps.triggers.getById(triggerId);
      if (!trigger || trigger.kind !== 'webhook' || !trigger.enabled) {
        return { ok: false, reason: 'not_found' };
      }
      const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? '');
      if (!match) return { ok: false, reason: 'unauthorized' };
      const hash = deps.triggers.getSecretHash(triggerId);
      if (!hash || !verifyTriggerSecret(match[1]!, hash)) {
        return { ok: false, reason: 'unauthorized' };
      }
      return { ok: true, trigger };
    },

    fireWebhook(trigger, payload, idempotencyKey) {
      if (idempotentHit(trigger.id, idempotencyKey)) {
        return { ok: false, reason: 'duplicate' };
      }
      const result = fire(trigger, 'webhook', buildWebhookInput(trigger, payload, now()));
      if (result.ok) rememberKey(trigger.id, idempotencyKey);
      return result;
    },

    fireFile(trigger, file) {
      return fire(trigger, 'file', {
        path: file.path,
        name: file.name,
        ext: file.ext,
        eventType: file.eventType,
        changedAt: file.changedAt,
        source: 'file',
        triggerId: trigger.id,
        file: { ...file },
      });
    },

    markError(triggerId) {
      if (deps.triggers.getById(triggerId)) record(triggerId, 'error');
    },
  };
}
