import { resolveClampedBudget } from '@wbfm/shared/constants';

/**
 * 任务上下文的预算常量与解析集中在此，供装配入口与各来源共享，
 * 避免 task-context ↔ sources 之间形成循环依赖。
 */

/** 注入的任务上下文 token 预算上限（字符粗估）；保留导出供旧调用方引用 */
export const TASK_CONTEXT_BUDGET_TOKENS = 2_000;
/** 小窗口模型下的任务上下文下限 */
export const TASK_CONTEXT_MIN_TOKENS = 320;
/** 任务上下文占模型上下文窗口的比例（已收敛到 CONTEXT_BUDGET_PRESETS） */
export const TASK_CONTEXT_WINDOW_RATIO = 0.15;
/** 近期对话注入条数（含用户与助手消息） */
export const TASK_CONTEXT_RECENT_MESSAGES = 6;

/** 按模型窗口解析任务上下文预算：统一走场景预算预设（contextBlock 15% / 320–2000） */
export function resolveTaskContextBudget(contextWindow: number | null | undefined): number {
  return resolveClampedBudget(contextWindow, 'contextBlock');
}
