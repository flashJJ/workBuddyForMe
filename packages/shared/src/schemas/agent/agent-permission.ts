import { z } from 'zod';

/** v2.13 M1：Agent 执行权限模式（只作用于 task_runs；聊天/协作按策略 defaultMode） */
export const AGENT_PERMISSION_MODES = [
  'confirm_each',
  'auto_edits',
  'smart_approve',
  'plan_only',
  'full_access',
] as const;

export type AgentPermissionMode = (typeof AGENT_PERMISSION_MODES)[number];

export const agentPermissionModeSchema = z.enum(AGENT_PERMISSION_MODES);

export const DEFAULT_AGENT_PERMISSION_MODE: AgentPermissionMode = 'confirm_each';

/** 无人值守允许的模式（full_access 本版永不进入白名单） */
export const AGENT_UNATTENDED_MODES = [
  'confirm_each',
  'auto_edits',
  'smart_approve',
  'plan_only',
] as const;

export type AgentUnattendedMode = (typeof AGENT_UNATTENDED_MODES)[number];

/** 工作目录路径长度上限（与 taskCreateSchema 共用） */
export const AGENT_WORKSPACE_PATH_MAX = 500;
