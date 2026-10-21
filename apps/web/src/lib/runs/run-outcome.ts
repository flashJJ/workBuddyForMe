import type { TaskRunStatus, TaskStopReason } from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';

/**
 * v2.4 M4 / P1-1：task / agent-run / flow-run 三套运行状态的统一口径。
 * - 状态：三套枚举归一为 RunOutcome（UI 只认这一套标签与色板）
 * - 失败原因：原始 error / errorCode / task stopReason 归一为 FailureReason
 * - 耗时：统一 startedAt(缺失回退 createdAt) → finishedAt(运行中取当前时间)
 * 纯函数，无 React 依赖，便于单测锁定。
 */

export type RunKind = 'task' | 'agent' | 'flow';

export type RunOutcome =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'budget_exceeded';

/** 统一状态标签（徽标/筛选器共用同一套文案） */
export const RUN_OUTCOME_LABEL_KEYS: Record<RunOutcome, MessageKey> = {
  queued: 'runs.outcome.queued',
  running: 'runs.outcome.running',
  waiting: 'runs.outcome.waiting',
  succeeded: 'runs.outcome.succeeded',
  failed: 'runs.outcome.failed',
  cancelled: 'runs.outcome.cancelled',
  interrupted: 'runs.outcome.interrupted',
  budget_exceeded: 'runs.outcome.budget_exceeded',
};

/** 失败类终态（需要展示「为什么失败 + 下一步」） */
export const FAILURE_OUTCOMES: ReadonlyArray<RunOutcome> = [
  'failed',
  'interrupted',
  'budget_exceeded',
];

export function isFailureOutcome(outcome: RunOutcome): boolean {
  return FAILURE_OUTCOMES.includes(outcome);
}

/** 运行中（耗时取当前时间） */
export function isLiveOutcome(outcome: RunOutcome): boolean {
  return outcome === 'queued' || outcome === 'running' || outcome === 'waiting';
}

/** task 的状态 + stopReason 共同决定语义：stopped 可能是正常急停，也可能是触达上限 */
export function taskOutcome(
  status: TaskRunStatus,
  stopReason?: TaskStopReason | null,
): RunOutcome {
  if (status === 'stopped' || status === 'failed') {
    switch (stopReason) {
      case 'completed':
        return 'succeeded';
      case 'user_stop':
        return 'cancelled';
      case 'max_steps':
      case 'max_failures':
        return 'budget_exceeded';
      case 'breaker':
      case 'error':
        return 'failed';
      default:
        return status === 'stopped' ? 'cancelled' : 'failed';
    }
  }
  switch (status) {
    case 'queued':
      return 'queued';
    case 'running':
      return 'running';
    case 'paused':
      return 'waiting';
    case 'completed':
      return 'succeeded';
    default:
      return 'failed';
  }
}

export function toOutcome(
  kind: RunKind,
  status: string,
  stopReason?: TaskStopReason | null,
): RunOutcome {
  if (kind === 'task') return taskOutcome(status as TaskRunStatus, stopReason);
  if (kind === 'agent') {
    switch (status) {
      case 'running':
        return 'running';
      case 'done':
        return 'succeeded';
      case 'failed':
        return 'failed';
      case 'cancelled':
        return 'cancelled';
      case 'budget_exceeded':
        return 'budget_exceeded';
      // connecting（卡片建立但未收到首帧）视作排队
      default:
        return 'queued';
    }
  }
  // connecting = 详情面板尚未接入 SSE 的初始相位，与排队同义
  switch (status) {
    case 'queued':
    case 'connecting':
      return 'queued';
    case 'running':
      return 'running';
    case 'waiting_human':
      return 'waiting';
    case 'succeeded':
      return 'succeeded';
    case 'cancelled':
      return 'cancelled';
    case 'interrupted':
      return 'interrupted';
    case 'failed':
    default:
      return 'failed';
  }
}

/** 失败归因分类：决定 i18n runs.failure.<reason>.{why,next} */
export type FailureReason =
  | 'cancelled'
  | 'max_steps'
  | 'max_failures'
  | 'budget_exceeded'
  | 'breaker'
  | 'interrupted'
  | 'rejected'
  | 'permission'
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'model'
  | 'tool'
  | 'node'
  | 'unknown';

export interface FailureSignals {
  outcome: RunOutcome;
  /** task 的 stopReason（其他链路为 null） */
  stopReason?: TaskStopReason | null;
  /** 原始错误文本（error.message / step.error / SSE error） */
  rawError?: string | null;
  /** 结构化错误码（flow run.error.code / agent errorCode） */
  code?: string | null;
}

/** 原始文本 → 人话分类；顺序敏感：先看确定性信号，再做文本启发式 */
const TEXT_RULES: ReadonlyArray<readonly [FailureReason, RegExp]> = [
  ['auth', /api[\s_-]?key|invalid[_\s-]?key|401|鉴权|密钥|凭证|authentication failed/i],
  ['permission', /denied|forbidden|permission|eacces|拒绝|无权限|未授权|没有权限/i],
  ['rate_limit', /rate.?limit|too many requests|429|quota|额度|限流/i],
  ['timeout', /timed?\s?out|timeout|etimedout|超时/i],
  ['network', /econn(?:refused|reset)|enotfound|fetch failed|network|socket|网络|连接失败|断网/i],
  ['model', /模型|provider|供应商|llm|openai|deepseek|ollama/i],
  ['tool', /工具|tool/i],
  ['node', /节点|node/i],
];

export function classifyFailure(signals: FailureSignals): FailureReason {
  const { outcome, stopReason, rawError, code } = signals;
  if (outcome === 'cancelled') return 'cancelled';
  if (outcome === 'interrupted') return 'interrupted';
  if (stopReason === 'max_steps') return 'max_steps';
  if (stopReason === 'max_failures') return 'max_failures';
  if (stopReason === 'breaker') return 'breaker';
  if (outcome === 'budget_exceeded') return 'budget_exceeded';

  const text = `${code ?? ''} ${rawError ?? ''}`.trim();
  if (!text) return 'unknown';
  if (/budget|预算|上限|exceeded/i.test(text)) return 'budget_exceeded';
  if (/cancel|abort|取消|已终止/i.test(text)) return 'cancelled';
  if (/reject|驳回|审查未通过/i.test(text)) return 'rejected';
  for (const [reason, pattern] of TEXT_RULES) {
    if (pattern.test(text)) return reason;
  }
  return 'unknown';
}

/**
 * 统一耗时口径：startedAt（缺失回退 createdAt）→ finishedAt；
 * 未结束且传了 nowMs 时按「至今」计算。任一缺失/非法/倒挂返回 null。
 */
export function runDurationMs(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!start || !end) return null;
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return to - from;
}

export function runElapsedMs(
  start: string | null | undefined,
  finishedAt: string | null | undefined,
  nowMs: number,
): number | null {
  return runDurationMs(start, finishedAt ?? new Date(nowMs).toISOString());
}

/** 耗时展示：<1s 用 ms，<10s 保留一位小数，其余 s / m+ss */
export function formatDurationMs(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${totalSeconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
