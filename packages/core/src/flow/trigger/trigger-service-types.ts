import type {
  FlowFileTriggerConfig,
  FlowTriggerView,
  FlowWebhookAuthMode,
} from '@wbfm/shared/types';
import type {
  WorkflowRepository,
  WorkflowRunRepository,
  WorkflowTriggerRepository,
} from '@wbfm/database';
import type { SecretCipher } from '../../secrets/cipher';
import type { CreateRunParams } from '../run/run-service-types';
import type { WebhookAuthResult } from './trigger-webhook-auth';

/** v5.0：触发器服务契约（从 trigger-service 拆出以控行数，公开面经原模块 re-export） */

export interface FlowTriggerRunner {
  createRun(params: CreateRunParams): string;
}

export type FireResult =
  | { ok: true; runId: string }
  | { ok: false; reason: 'busy' | 'not_published' | 'duplicate' | 'disabled' | 'error' };

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
  /** v5.0：HMAC 验签所需的密钥加密器（缺省时只能 Bearer） */
  cipher?: SecretCipher;
}

export interface FlowTriggerService {
  list(workflowId: string): FlowTriggerView[];
  create(
    workflowId: string,
    input:
      | { kind: 'webhook'; name?: string; auth?: { authMode: FlowWebhookAuthMode } }
      | { kind: 'file'; name?: string; config: FlowFileTriggerConfig },
  ): { trigger: FlowTriggerView; secret?: string };
  update(
    workflowId: string,
    triggerId: string,
    patch: {
      name?: string;
      enabled?: boolean;
      config?: FlowFileTriggerConfig;
      auth?: { authMode: FlowWebhookAuthMode };
    },
  ): FlowTriggerView;
  remove(workflowId: string, triggerId: string): boolean;
  /** v4.26：轮换 Webhook Secret；新明文仅本次返回 */
  rotateSecret(workflowId: string, triggerId: string): { trigger: FlowTriggerView; secret: string };
  authenticateWebhook(
    triggerId: string,
    authorization: string | null,
    options?: {
      rawBody?: string;
      timestamp?: string | null;
      signature?: string | null;
    },
  ): WebhookAuthResult;
  fireWebhook(
    trigger: FlowTriggerView,
    payload: Record<string, unknown>,
    idempotencyKey?: string,
  ): FireResult;
  fireFile(trigger: FlowTriggerView, file: FileTriggerEvent): FireResult;
  /** 监听器无法建立时的状态回写 */
  markError(triggerId: string): void;
}
