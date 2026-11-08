import {
  TASK_CHECKPOINT_BLOCK_RESERVE_TOKENS,
  TASK_CHECKPOINT_TTL_MINUTES,
} from '@wbfm/shared/constants';
import type { TaskCheckpoint, TaskCheckpointTodo, ToolTraceEntry } from '@wbfm/shared/types';
import type { ConversationGoalView, WorkPlanView } from '@wbfm/shared/schemas';
import { truncateToTokens } from '../chat/context/context-budget';

/**
 * v2.26 P1 工作记忆：任务检查点。
 *
 * 从当前目标/计划/待办 + 最近一次工具结果构造快照，供长任务在多轮之间
 * 保持「我在做什么、做到哪、下一步」；带 TTL，完成或超时归档。
 */

export interface TaskCheckpointContext {
  goal: ConversationGoalView | null;
  plan: WorkPlanView | null;
  todo: WorkPlanView | null;
}

export interface TaskCheckpointSnapshot {
  goal: string | null;
  plan: string | null;
  todos: TaskCheckpointTodo[];
  lastToolSummary: string | null;
  nextStep: string | null;
  expiresAt: string;
}

export interface TaskCheckpointOptions {
  lastTrace?: readonly ToolTraceEntry[];
  now?: number;
  ttlMinutes?: number;
}

const ACTIVE_PLAN_STATUS = new Set(['approved', 'running']);
const ACTIVE_STEP = new Set(['pending', 'running']);

/** 最近一次工具结果的短摘要（失败优先保留错误） */
export function summarizeLastTool(trace?: readonly ToolTraceEntry[]): string | null {
  const last = trace?.at(-1);
  if (!last) return null;
  const outcome = last.status === 'error' ? last.error ?? last.resultSummary : last.resultSummary;
  const text = `${last.tool}：${outcome || last.argsSummary || '（无输出）'}`;
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

/**
 * 构造检查点快照：
 * - 仅对已批准/执行中的计划、或 Todo 建模；
 * - 所有步骤终态且无活跃目标 → 返回 null（上层据此归档旧检查点）。
 */
export function buildTaskCheckpointSnapshot(
  ctx: TaskCheckpointContext,
  options: TaskCheckpointOptions = {},
): TaskCheckpointSnapshot | null {
  const plan = ctx.plan && ACTIVE_PLAN_STATUS.has(ctx.plan.status) ? ctx.plan : null;
  const steps = ctx.todo?.steps ?? plan?.steps ?? [];
  const activeSteps = steps.filter((step) => ACTIVE_STEP.has(step.status));
  if (!ctx.goal && !ctx.todo && !plan) return null;
  if (steps.length > 0 && activeSteps.length === 0 && !ctx.goal) return null;

  const now = options.now ?? Date.now();
  const ttl = options.ttlMinutes ?? TASK_CHECKPOINT_TTL_MINUTES;
  return {
    goal: ctx.goal?.title ?? null,
    plan: plan ? `《${plan.title}》${plan.status === 'running' ? '执行中' : '已批准'}` : null,
    todos: steps.slice(0, 10).map((step) => ({ title: step.title, status: step.status })),
    lastToolSummary: summarizeLastTool(options.lastTrace),
    nextStep: activeSteps[0]?.title ?? null,
    expiresAt: new Date(now + ttl * 60_000).toISOString(),
  };
}

const STATUS_LABELS: Record<TaskCheckpointTodo['status'], string> = {
  pending: '待办',
  running: '进行中',
  done: '完成',
  skipped: '跳过',
  blocked: '受阻',
};

/** 检查点渲染为 system 区块（硬限长）；无有效内容返回 null */
export function buildCheckpointPromptBlock(checkpoint: TaskCheckpoint): string | null {
  const lines: string[] = ['【任务检查点】'];
  if (checkpoint.goal) lines.push(`目标：${checkpoint.goal}`);
  if (checkpoint.plan) lines.push(`计划：${checkpoint.plan}`);
  if (checkpoint.todos.length > 0) {
    lines.push('待办：');
    for (const todo of checkpoint.todos) {
      lines.push(`- [${STATUS_LABELS[todo.status] ?? todo.status}] ${todo.title}`);
    }
  }
  if (checkpoint.lastToolSummary) lines.push(`最近工具：${checkpoint.lastToolSummary}`);
  if (checkpoint.nextStep) lines.push(`下一步：${checkpoint.nextStep}`);
  lines.push('（检查点会随任务完成或超时归档；与最新对话不一致时以最新对话为准）');
  const clipped = truncateToTokens(lines.join('\n'), TASK_CHECKPOINT_BLOCK_RESERVE_TOKENS);
  return clipped.trim() || null;
}
