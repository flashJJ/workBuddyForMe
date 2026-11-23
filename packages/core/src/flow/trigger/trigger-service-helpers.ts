import { statSync } from 'node:fs';
import { isAbsolute, parse } from 'node:path';
import { ApiError } from '@wbfm/shared/errors';
import type { FlowFileTriggerConfig, FlowTriggerView } from '@wbfm/shared/types';
import type { WorkflowRepository } from '@wbfm/database';

/** v4.25 触发器服务的纯函数与常量（从 trigger-service 拆出，控制单文件行数） */

export const WEBHOOK_LIMIT = 5;
export const FILE_LIMIT = 5;
export const IDEMPOTENCY_TTL_MS = 10 * 60_000;
export const IDEMPOTENCY_MAX = 500;

const RESERVED_INPUT_KEYS = new Set(['source', 'triggerId', 'receivedAt', 'payload']);

export function defaultIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function normalizeExtensions(extensions: string[]): string[] {
  const normalized = extensions.map((ext) => ext.trim().toLowerCase().replace(/^\./, ''));
  for (const ext of normalized) {
    if (!/^[a-z0-9]{1,16}$/.test(ext)) {
      throw ApiError.validation(`扩展名不合法：${ext}（仅小写字母或数字）`);
    }
  }
  return [...new Set(normalized)];
}

export function requireWorkflow(workflows: WorkflowRepository, workflowId: string) {
  const workflow = workflows.getWorkflow(workflowId);
  if (!workflow) throw ApiError.notFound('工作流', workflowId);
  return workflow;
}

export function ensurePublished(workflow: { status: string; publishedVersion: number | null }): void {
  if (workflow.status !== 'published' || workflow.publishedVersion === null) {
    throw ApiError.conflict('工作流尚未发布，请先发布后再配置触发器');
  }
}

export function validateFileConfig(
  config: FlowFileTriggerConfig,
  isDirectory: (path: string) => boolean,
): FlowFileTriggerConfig {
  if (!isAbsolute(config.path)) {
    throw ApiError.validation('目录必须是绝对路径');
  }
  const parsed = parse(config.path);
  if (parsed.root === config.path) {
    throw ApiError.validation('不能监听磁盘根目录');
  }
  if (!isDirectory(config.path)) {
    throw ApiError.validation(`目录不存在或不可读：${config.path}`);
  }
  return {
    path: config.path,
    extensions: normalizeExtensions(config.extensions),
    recursive: config.recursive ?? true,
  };
}

/** body 顶层合并 + 原始 payload；保留键不可被 body 覆盖 */
export function buildWebhookInput(
  trigger: FlowTriggerView,
  payload: Record<string, unknown>,
  at: Date,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!RESERVED_INPUT_KEYS.has(key)) input[key] = value;
  }
  return {
    ...input,
    payload,
    source: 'webhook',
    triggerId: trigger.id,
    receivedAt: at.toISOString(),
  };
}
