/**
 * v2.20：运行结果统一口径（跨 task/flow/agent/chat 投影共用）。
 * 只放 8 个归一化终态/中间态；具体业务枚举在各自 schema 内映射到这一组。
 */
export const RUN_OUTCOMES = [
  'queued',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'cancelled',
  'interrupted',
  'budget_exceeded',
] as const;

export type RunOutcome = (typeof RUN_OUTCOMES)[number];
