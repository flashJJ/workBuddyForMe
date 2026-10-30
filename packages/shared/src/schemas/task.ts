import { z } from 'zod';
import type { Citation } from '../types/domain';
import {
  agentPermissionModeSchema,
  AGENT_WORKSPACE_PATH_MAX,
  type AgentPermissionMode,
} from './agent-permission';

/**
 * v0.7 M3 任务级 Agent 循环契约：
 * 用户给出目标后，core 进入「观察 → 决策 → 执行 → 再观察」循环，
 * 运行与每一步落库（task_runs / task_steps），经 SSE task 事件推给前端时间线。
 */

export const TASK_RUN_STATUSES = [
  'queued',
  'running',
  'paused',
  'stopped',
  'completed',
  'failed',
] as const;
export type TaskRunStatus = (typeof TASK_RUN_STATUSES)[number];

/** 运行终止原因（completed 之外的终态都带原因） */
export const TASK_STOP_REASONS = [
  'completed',
  'max_steps',
  'max_failures',
  'user_stop',
  'breaker',
  'error',
  /** v2.8：应用重启/进程退出，非终态运行被收敛 */
  'interrupted',
  /** v2.13：策略步数 / 时长 / 写入 / 外部调用超限 */
  'policy_limit',
] as const;
export type TaskStopReason = (typeof TASK_STOP_REASONS)[number];

/** 步骤类型：observe=观察（截图/UIA）；action=工具执行；final=模型宣告完成（无工具） */
export const TASK_STEP_KINDS = ['observe', 'action', 'final'] as const;
export type TaskStepKind = (typeof TASK_STEP_KINDS)[number];

export const TASK_STEP_STATUSES = ['running', 'completed', 'failed'] as const;
export type TaskStepStatus = (typeof TASK_STEP_STATUSES)[number];

/** 创建任务请求（POST /api/tasks） */
export const taskCreateSchema = z.object({
  conversationId: z.string().min(1),
  goal: z.string().min(1).max(2000),
  /** 步数上限可下调（默认 TASK_MAX_STEPS，硬上限 50 防失控） */
  maxSteps: z.number().int().min(1).max(50).optional(),
  /** v2.13：执行模式（缺省由策略 defaultMode 决定） */
  permissionMode: agentPermissionModeSchema.optional(),
  /** v2.13：工作目录（可选；文件/命令类操作限定在目录内） */
  workspacePath: z.string().trim().min(1).max(AGENT_WORKSPACE_PATH_MAX).nullable().optional(),
  /** v2.13：full_access 必须显式确认 */
  acknowledgeFullAccess: z.boolean().optional(),
});
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

/** 任务运行视图（API/事件载荷） */
export interface TaskRunView {
  id: string;
  conversationId: string;
  assistantId: string;
  goal: string;
  status: TaskRunStatus;
  stepCount: number;
  failureCount: number;
  maxSteps: number;
  stopReason: TaskStopReason | null;
  /** v2.13：本次运行固定的执行模式 */
  permissionMode: AgentPermissionMode;
  /** v2.13：工作目录（realpath 归一化后）；null=未指定 */
  workspacePath: string | null;
  /** v2.13：来源定时 Agent 任务 id */
  originScheduledTaskId: string | null;
  /** v2.13：运行创建时的策略哈希；null=尚未启用策略（M2 起写入） */
  policyHash: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

/** 任务步骤视图（时间线条目：截图 + 动作 + 决策理由） */
export interface TaskStepView {
  id: string;
  runId: string;
  stepIndex: number;
  kind: TaskStepKind;
  /** action 步的工具名；observe/final 为 null */
  toolName: string | null;
  /** 模型决策理由（为什么做这一步） */
  reason: string;
  /** 工具参数 / 观察摘要（JSON 字符串，空串=无） */
  argsJson: string;
  resultJson: string;
  /** 观察截图 attachments 相对路径（空串=本步无截图） */
  screenshotPath: string;
  /** v1.4：action 步工具产出的引用（如 knowledge_search 命中），供 Executor 收敛证据 */
  citations?: Citation[];
  status: TaskStepStatus;
  error: string;
  durationMs: number;
  createdAt: string;
}

/** SSE task 事件子类型 */
export const TASK_EVENT_TYPES = [
  'run_started',
  'step_started',
  'step_finished',
  'run_paused',
  'run_resumed',
  'run_finished',
] as const;
export type TaskEventType = (typeof TASK_EVENT_TYPES)[number];

/** SSE task 事件载荷（前端任务时间线数据源） */
export interface TaskEventPayload {
  type: TaskEventType;
  runId: string;
  conversationId: string;
  run?: TaskRunView;
  step?: TaskStepView;
}
