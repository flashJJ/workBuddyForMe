import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from '@wbfm/shared/errors';
import {
  workflowCapabilityPayloadSchema,
  type CapabilityManifest,
} from '@wbfm/shared/schemas';
import type { WorkflowRepository } from '@wbfm/database';
import { compileFlow } from '../../flow/compiler';

export interface WorkflowEffectDeps {
  workflows: WorkflowRepository;
}

function parsePayload(packDir: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(packDir, 'payload/workflow.json'), 'utf8'));
  } catch (error) {
    throw ApiError.validation(
      `工作流 payload 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = workflowCapabilityPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.validation(
      `工作流 payload 校验失败：${parsed.error.issues.map((issue) => issue.message).join('；')}`,
    );
  }
  return parsed.data;
}

/** 启用：建行 → 存版本 → 发布；任一步失败回滚已建行 */
export function enableWorkflow(
  manifest: CapabilityManifest,
  packDir: string,
  deps: WorkflowEffectDeps,
): string {
  const payload = parsePayload(packDir);
  const compiled = compileFlow(payload.graph);
  if (!compiled.ok) {
    throw ApiError.validation(
      `工作流图校验失败：${compiled.diagnostics.map((item) => item.message).join('；')}`,
    );
  }

  const existing = deps.workflows.findByOriginCapabilityId(manifest.id);
  if (existing) {
    // 停用后再次启用：复用同一工作流，缺失版本时补图后发布
    if (existing.currentVersion === 0) {
      deps.workflows.addVersion(existing.id, payload.graph);
    }
    deps.workflows.publishVersion(existing.id);
    return existing.id;
  }

  const workflow = deps.workflows.createWorkflow({
    name: payload.name,
    description: payload.description,
    icon: payload.icon,
    color: payload.color,
    originCapabilityId: manifest.id,
  });
  try {
    const version = deps.workflows.addVersion(workflow.id, payload.graph);
    if (!version) throw ApiError.validation('工作流版本保存失败');
    deps.workflows.publishVersion(workflow.id);
  } catch (error) {
    deps.workflows.deleteWorkflow(workflow.id);
    throw error;
  }
  return workflow.id;
}

/** v2.12：升级（旧包启用中）：加新版本并发布，句柄不变 */
export function upgradeWorkflow(
  manifest: CapabilityManifest,
  packDir: string,
  workflowId: string,
  deps: WorkflowEffectDeps,
): string {
  const payload = parsePayload(packDir);
  const compiled = compileFlow(payload.graph);
  if (!compiled.ok) {
    throw ApiError.validation(
      `工作流图校验失败：${compiled.diagnostics.map((item) => item.message).join('；')}`,
    );
  }
  const version = deps.workflows.addVersion(workflowId, payload.graph);
  if (!version) throw ApiError.validation('工作流版本保存失败');
  deps.workflows.publishVersion(workflowId, version.version);
  return workflowId;
}

/** v2.12：升级（旧包禁用）：只加新版本，保持禁用 */
export function upgradeWorkflowDisabled(
  manifest: CapabilityManifest,
  packDir: string,
  workflowId: string,
  deps: WorkflowEffectDeps,
): void {
  const payload = parsePayload(packDir);
  const compiled = compileFlow(payload.graph);
  if (!compiled.ok) {
    throw ApiError.validation(
      `工作流图校验失败：${compiled.diagnostics.map((item) => item.message).join('；')}`,
    );
  }
  if (!deps.workflows.addVersion(workflowId, payload.graph)) {
    throw ApiError.validation('工作流版本保存失败');
  }
  deps.workflows.setStatus(workflowId, 'disabled');
}

/** v2.12：回滚：启用态重新发布旧版本；禁用态恢复当前版本并保持禁用 */
export function restoreWorkflowVersion(
  workflowId: string,
  version: number,
  wasEnabled: boolean,
  deps: WorkflowEffectDeps,
): void {
  if (wasEnabled) {
    deps.workflows.publishVersion(workflowId, version);
    return;
  }
  deps.workflows.setCurrentVersion(workflowId, version);
  deps.workflows.setStatus(workflowId, 'disabled');
}

export function disableWorkflow(effectRef: string, deps: WorkflowEffectDeps): void {
  deps.workflows.setStatus(effectRef, 'disabled');
}

/** 卸载：无运行且无端点 → 删行（版本随外键级联）；否则保留禁用行 */
export function uninstallWorkflow(effectRef: string, deps: WorkflowEffectDeps): void {
  if (!deps.workflows.hasRuns(effectRef) && !deps.workflows.hasEndpoint(effectRef)) {
    deps.workflows.deleteWorkflow(effectRef);
    return;
  }
  deps.workflows.setStatus(effectRef, 'disabled');
}
