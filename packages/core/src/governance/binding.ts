import { createHash } from 'node:crypto';
import { ApiError } from '@wbfm/shared/errors';
import type { OperationBinding } from '@wbfm/shared/schemas';
import { canonicalJson } from '@wbfm/shared/schemas';

/** v2.13 M2：审批绑定计算与比对（只存哈希，不落完整参数 / 环境变量） */

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface ComputeBindingInput {
  tool: string;
  args?: unknown;
  cwd?: string | null;
  env?: Record<string, string> | null;
  fileOperands?: string[];
  target?: { windowId?: string; processName?: string } | null;
  policyHash?: string | null;
}

export function computeOperationBinding(input: ComputeBindingInput): OperationBinding {
  const binding: OperationBinding = {
    tool: input.tool,
    argsHash: sha256(canonicalJson(input.args ?? {})),
  };
  if (input.cwd) binding.cwd = input.cwd;
  if (input.env) binding.envHash = sha256(canonicalJson(input.env));
  if (input.fileOperands && input.fileOperands.length > 0) {
    binding.fileOperands = [...input.fileOperands].sort();
  }
  if (input.target && (input.target.windowId || input.target.processName)) {
    binding.target = {
      ...(input.target.windowId ? { windowId: input.target.windowId } : {}),
      ...(input.target.processName ? { processName: input.target.processName } : {}),
    };
  }
  if (input.policyHash) binding.policyHash = input.policyHash;
  return binding;
}

function stable(value: unknown): string {
  return canonicalJson(value);
}

/** 执行前比对：任一字段漂移抛 409 APPROVAL_BINDING_DRIFT */
export function assertBindingMatches(
  expected: OperationBinding,
  actual: OperationBinding,
): void {
  if (stable(expected) === stable(actual)) return;
  throw new ApiError('CONFLICT', '审批绑定已变化，操作被拒绝', {
    code: 'APPROVAL_BINDING_DRIFT',
  });
}

/** 供 409 错误 details 使用（调用方可在 catch 中读取） */
export function bindingDriftDetails(): { code: 'APPROVAL_BINDING_DRIFT' } {
  return { code: 'APPROVAL_BINDING_DRIFT' };
}

/** 审批中心展示摘要：目标窗口 / 目录 / 策略来源，不含完整参数 */
export function summarizeBinding(binding: OperationBinding, argsSummary: string): string {
  const parts = [binding.tool, argsSummary];
  if (binding.cwd) parts.push(`cwd=${binding.cwd}`);
  if (binding.target?.processName) parts.push(`process=${binding.target.processName}`);
  if (binding.target?.windowId) parts.push(`window=${binding.target.windowId}`);
  return parts.join(' · ').slice(0, 240);
}
