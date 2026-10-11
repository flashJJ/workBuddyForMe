import type { ExecutorOutcome, ReviewVerdictPayload, SubtaskSpec } from '@wbfm/shared/schemas';
import { AGENT_LIMITS } from '@wbfm/shared/schemas';

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

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max);
}

/**
 * Planner 降级：无法产出合法子任务单时，把用户原始目标直接派单——
 * 不假装完成规划，子任务单显式标注为降级派单，Executor 拿到完整目标自行裁量。
 */
export function buildFallbackSubtask(goal: string): SubtaskSpec {
  const title = clip(goal, AGENT_LIMITS.SUBTASK_TITLE_MAX) || '未解析的用户目标';
  const brief =
    clip(goal, AGENT_LIMITS.SUBTASK_BRIEF_MAX) ||
    '规划器未能产出结构化子任务单，请执行者直接围绕用户目标尽力完成。';
  return {
    title: `[降级派单] ${title}`.slice(0, AGENT_LIMITS.SUBTASK_TITLE_MAX),
    brief,
    acceptance: ['围绕用户目标给出可交付结论，并在未竟事项中说明无法确认的部分'],
    toolScopes: undefined,
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
    reviewNotes: '审查器连续两次未产出合法裁决，系统自动通过（未经独立审查）',
    acceptanceResults: [],
  };
}

/** budget_exceeded 终态时交付的「预算内最佳结果」：保留最后一轮交付，补注未竟项 */
export function withBudgetNote(outcome: ExecutorOutcome, reason: string): ExecutorOutcome {
  return {
    ...outcome,
    unfinished: [...outcome.unfinished, `[预算触顶] ${reason}，后续轮次未执行`].slice(0, 20),
  };
}
