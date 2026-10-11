import type { Assistant } from '@wbfm/shared/types';
import { resolveChatTargetForModelId, type ResolvedChatTarget } from '../chat/model-resolver';
import type { ServiceDeps } from '../services/deps';

/**
 * v1.4 M2 协作角色模型三级回落（T2.4）：
 * 节点/调用方显式 modelId → 助手角色覆盖（plannerModelId/executorModelId/reviewerModelId）
 * → 助手通用 modelId → 系统默认对话模型。
 * 后两级封装在 resolveChatTargetForModelId 的 null 回落里；视觉等能力门控由调用方
 * 按 target.model.capabilities 判断（executor 仅 screen 模式要求视觉）。
 */

export const AGENT_ROLE_MODEL_FIELDS = {
  planner: 'plannerModelId',
  executor: 'executorModelId',
  reviewer: 'reviewerModelId',
} as const;

export type AgentRoleKey = keyof typeof AGENT_ROLE_MODEL_FIELDS;

export interface ResolveRoleTargetOptions {
  /** 第一级：节点/调用方显式覆盖（M3 Flow agent 节点使用） */
  explicitModelId?: string | null;
}

export function resolveRoleTarget(
  deps: Pick<ServiceDeps, 'db' | 'cipher'>,
  assistant: Assistant,
  role: AgentRoleKey,
  options: ResolveRoleTargetOptions = {},
): ResolvedChatTarget {
  const roleModelId = assistant[AGENT_ROLE_MODEL_FIELDS[role]];
  return resolveChatTargetForModelId(
    deps,
    options.explicitModelId ?? roleModelId ?? assistant.modelId ?? null,
  );
}

/** 目标模型是否具备视觉能力（executor screen 观察模式门控） */
export function targetHasVision(target: ResolvedChatTarget): boolean {
  return target.model.capabilities.includes('vision');
}
