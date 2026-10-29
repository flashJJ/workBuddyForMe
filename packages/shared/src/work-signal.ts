/**
 * v2.7：跨 task / flow / agent 的实时工作信号与桌宠聚合。
 *
 * 口径：
 * - 复用运行报告的 8 个 RunOutcome（queued/running/waiting/succeeded/failed/
 *   cancelled/interrupted/budget_exceeded），不新增平行终态；
 * - 注意力（审批/输入）是独立维度，不占用 outcome；
 * - 本文件只放类型与纯函数，不依赖 React / DB / Node。
 */

export const WORK_SOURCES = ['task', 'flow', 'agent', 'chat', 'meeting', 'subagent'] as const;
export type WorkSource = (typeof WORK_SOURCES)[number];

export const WORK_OUTCOMES = [
  'queued',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'cancelled',
  'interrupted',
  'budget_exceeded',
] as const;
export type WorkOutcome = (typeof WORK_OUTCOMES)[number];

export const WORK_ATTENTIONS = ['none', 'approval', 'input'] as const;
export type WorkAttention = (typeof WORK_ATTENTIONS)[number];

export const WORK_ACTIVITIES = [
  'idle',
  'thinking',
  'searching',
  'reading',
  'writing',
  'executing',
  'verifying',
  'meeting',
  'speaking',
] as const;
export type WorkActivity = (typeof WORK_ACTIVITIES)[number];

export const APPROVAL_SOURCES = ['tool', 'flow', 'desktop', 'subagent'] as const;
export type ApprovalSource = (typeof APPROVAL_SOURCES)[number];

export interface WorkSignal {
  /** `${source}:${runId}` */
  key: string;
  source: WorkSource;
  runId: string;
  title: string;
  outcome: WorkOutcome;
  attention: WorkAttention;
  activity: WorkActivity;
  stepLabel: string | null;
  completedSteps: number;
  totalSteps: number | null;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  errorReason: string | null;
  deepLink: string;
}

export interface WorkApproval {
  id: string;
  source: ApprovalSource;
  title: string;
  tool: string | null;
  permission: 'read' | 'write' | 'danger' | null;
  argsSummary: string | null;
  runId: string | null;
  conversationId: string | null;
  createdAt: string;
  expiresAt: string | null;
  deepLink: string;
}

export interface WorkSignalSnapshot {
  seq: number;
  generatedAt: string;
  signals: WorkSignal[];
  approvals: WorkApproval[];
}

export type PetWorkBase =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting'
  | 'success'
  | 'error'
  | 'disconnected';

export interface PetWorkView {
  base: PetWorkBase;
  primary: WorkSignal | null;
  runningCount: number;
  approvalCount: number;
  /** 完成/错误只做一次性脉冲，不改变基础态 */
  pulse: 'success' | 'error' | null;
  headline: string;
}

/** 终态（不再推进） */
export function isTerminalOutcome(outcome: WorkOutcome): boolean {
  return (
    outcome === 'succeeded' ||
    outcome === 'failed' ||
    outcome === 'cancelled' ||
    outcome === 'interrupted' ||
    outcome === 'budget_exceeded'
  );
}

/** 失败类终态（桌宠显示 ERROR） */
export function isFailureOutcome(outcome: WorkOutcome): boolean {
  return outcome === 'failed' || outcome === 'interrupted' || outcome === 'budget_exceeded';
}

/** 工具名 → 工作活动（只做粗粒度映射，不追求覆盖所有工具） */
export function activityForTool(toolName: string | null | undefined): WorkActivity {
  if (!toolName) return 'thinking';
  const name = toolName.toLowerCase();
  if (/(search|retriev|knowledge|web|fetch|rag)/.test(name)) return 'searching';
  if (/(read|list|glob|grep|inspect|screenshot|observe)/.test(name)) return 'reading';
  if (/(write|edit|patch|create|save|apply)/.test(name)) return 'writing';
  if (/(test|verify|lint|check|review)/.test(name)) return 'verifying';
  if (/(run|exec|shell|terminal|command|bash|powershell)/.test(name)) return 'executing';
  return 'executing';
}

/** 终态信号保留窗口（桌宠脉冲/错误提示） */
export const TERMINAL_SIGNAL_TTL_MS = 60_000;
/** 完成/错误脉冲窗口 */
export const PULSE_WINDOW_MS = 15_000;

/** 过滤过期终态信号；运行中的信号永不因时间被丢 */
export function pruneWorkSignals(signals: WorkSignal[], nowMs = Date.now()): WorkSignal[] {
  return signals.filter((signal) => {
    if (!isTerminalOutcome(signal.outcome)) return true;
    const endedAt = signal.endedAt ? Date.parse(signal.endedAt) : Date.parse(signal.updatedAt);
    return Number.isFinite(endedAt) && nowMs - endedAt <= TERMINAL_SIGNAL_TTL_MS;
  });
}

/** 主运行优先级：待审批 > 失败 > 运行中（最近更新优先） > 排队 > 完成 > 取消 */
function signalRank(signal: WorkSignal, approvals: WorkApproval[]): number {
  if (approvals.some((approval) => approval.runId === signal.runId)) return 0;
  if (signal.attention === 'approval') return 1;
  if (signal.outcome === 'waiting') return 2;
  if (isFailureOutcome(signal.outcome)) return 3;
  if (signal.outcome === 'running') return 4;
  if (signal.outcome === 'queued') return 5;
  if (signal.outcome === 'succeeded') return 6;
  if (signal.outcome === 'cancelled') return 7;
  return 8;
}

/** 多运行聚合为桌宠可消费的单一视图 */
export function aggregateWorkSignals(
  signals: WorkSignal[],
  approvals: WorkApproval[],
  nowMs = Date.now(),
): PetWorkView {
  const live = signals.filter((signal) => !isTerminalOutcome(signal.outcome));
  const runningCount = live.length;
  const approvalCount = approvals.length;

  if (approvalCount > 0) {
    const primary =
      signals.find((signal) => approvals.some((approval) => approval.runId === signal.runId)) ??
      signals.find((signal) => signal.attention === 'approval') ??
      null;
    return {
      base: 'waiting',
      primary,
      runningCount,
      approvalCount,
      pulse: null,
      headline: primary ? `等待审批：${primary.title}` : `有 ${approvalCount} 项待审批`,
    };
  }

  const latestFailure = signals
    .filter((signal) => isFailureOutcome(signal.outcome))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  if (latestFailure) {
    const age = nowMs - Date.parse(latestFailure.endedAt ?? latestFailure.updatedAt);
    if (Number.isFinite(age) && age <= PULSE_WINDOW_MS) {
      return {
        base: 'error',
        primary: latestFailure,
        runningCount,
        approvalCount,
        pulse: 'error',
        headline: latestFailure.errorReason ?? latestFailure.title,
      };
    }
  }

  const active = live
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  if (active) {
    const base: PetWorkBase =
      active.outcome === 'waiting'
        ? 'waiting'
        : active.activity === 'thinking'
          ? 'thinking'
          : 'working';
    return {
      base,
      primary: active,
      runningCount,
      approvalCount,
      pulse: null,
      headline: active.stepLabel ? `${active.title} · ${active.stepLabel}` : active.title,
    };
  }

  const latestSuccess = signals
    .filter((signal) => signal.outcome === 'succeeded')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  if (latestSuccess) {
    const age = nowMs - Date.parse(latestSuccess.endedAt ?? latestSuccess.updatedAt);
    if (Number.isFinite(age) && age <= PULSE_WINDOW_MS) {
      return {
        base: 'success',
        primary: latestSuccess,
        runningCount,
        approvalCount,
        pulse: 'success',
        headline: `完成：${latestSuccess.title}`,
      };
    }
  }

  return {
    base: 'idle',
    primary: null,
    runningCount,
    approvalCount,
    pulse: null,
    headline: '',
  };
}

/** 供排序/调试：按优先级与更新时间排序（不修改入参） */
export function sortWorkSignals(
  signals: WorkSignal[],
  approvals: WorkApproval[] = [],
): WorkSignal[] {
  return signals
    .slice()
    .sort((a, b) => {
      const rank = signalRank(a, approvals) - signalRank(b, approvals);
      if (rank !== 0) return rank;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
}
