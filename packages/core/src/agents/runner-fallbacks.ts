import type { ExecutorOutcome, ReviewVerdictPayload, SubtaskSpec } from '@wbfm/shared/schemas';
import { AGENT_LIMITS } from '@wbfm/shared/schemas';
import { sys } from '../i18n/system-text';

/**
 * 角色协议降级构造（M1 容错语义的纯函数）：
 * 角色模型连续 2 次无法产出合法协议时的安全回落，降级动作必须在交接与
 * 事件中显式可见（不静默）。
 */

const PLANNER_FAILURE_LIMIT = 2;
const REVIEWER_FAILURE_LIMIT = 2;

export const AGENT_PROTOCOL_FAILURE_LIMITS = {
  planner: PLANNER_FAILURE_LIMIT,
  reviewer: REVIEWER_FAILURE_LIMIT,
} as const;

/**
 * 带协议级容错的角色调用：连续失败达上限后由 fallback 兜底（不静默，标注 degraded）。
 * signal 已中止（用户急停/SSE 断线）时立即上抛，不计失败、不重试、不打降级日志。
 */
export async function callWithFallback<T>(
  label: string,
  attempt: () => Promise<T>,
  limit: number,
  fallback: () => T,
  signal?: AbortSignal,
): Promise<{ value: T; degraded: boolean }> {
  for (let i = 0; i < limit; i += 1) {
    try {
      return { value: await attempt(), degraded: false };
    } catch (error) {
      if (signal?.aborted) throw error;
      // 失败原因必须可见：旧实现空 catch 导致角色连续失败降级后无从排查
      console.warn(
        `[agent] ${label} 第 ${i + 1}/${limit} 次调用失败：`,
        error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      );
    }
  }
  console.warn(`[agent] ${label} 连续 ${limit} 次失败，启用降级兜底`);
  return { value: fallback(), degraded: true };
}

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max);
}

/**
 * Planner 降级：无法产出合法子任务单时，把用户原始目标直接派单——
 * 不假装完成，子任务单显式标注为降级派单，Executor 拿到完整目标自行裁量。
 * v1.4 热修：保留可用工具域（如 knowledge），知识库不收敛单库、由 Executor
 * 继承助手全部绑定，避免降级后「无工具可用」只能输出脱离私有资料的通用结论。
 */
export function buildFallbackSubtask(goal: string, toolScopes?: string[]): SubtaskSpec {
  const clippedGoal = clip(goal, AGENT_LIMITS.SUBTASK_TITLE_MAX);
  // title schema 上限 100 字符：带 goal 的标记超限时退化为不带 goal 的固定徽标
  // （用户原始目标仍在 brief 与 run.goal 中完整保留）
  const withGoal = sys('agentTrace.fallback.degradedTitle', { goal: clippedGoal });
  const title = clippedGoal && withGoal.length <= AGENT_LIMITS.SUBTASK_TITLE_MAX
    ? withGoal
    : sys('agentTrace.fallback.degradedBadge');
  const brief = clippedGoal || sys('agentTrace.fallback.unparsedGoal');
  return {
    title,
    brief: clippedGoal
      ? brief
      : sys('agentTrace.fallback.plannerBrief'),
    acceptance: [sys('agentTrace.fallback.acceptance')],
    ...(toolScopes?.length ? { toolScopes: [...toolScopes] } : {}),
    knowledgeBaseId: undefined,
  };
}

/**
 * Reviewer 降级：无法产出合法裁决时自动通过，但显式标注——
 * 不阻塞交付，同时让 UI/eval 能识别这是未审查的通过。
 */
export function buildFallbackVerdict(): ReviewVerdictPayload {
  return {
    verdict: 'approve',
    reviewNotes: sys('agentTrace.fallback.autoApproved'),
    acceptanceResults: [],
  };
}

/** budget_exceeded 终态时交付的「预算内最佳结果」：保留最后一轮交付，补注未竟项 */
export function withBudgetNote(outcome: ExecutorOutcome, kind: 'rounds' | 'steps' | 'tokens'): ExecutorOutcome {
  return {
    ...outcome,
    unfinished: [
      ...outcome.unfinished,
      sys('agentTrace.budget.note', { kind: sys(`agentTrace.budget.kind.${kind}`) }),
    ].slice(0, 20),
  };
}
