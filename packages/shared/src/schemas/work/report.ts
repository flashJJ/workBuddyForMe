import { z } from 'zod';

/** v2.6 M5 P1-2：运行证据汇总（跨 task / flow / agent-run，不新增运行表） */
export const RUN_EVIDENCE_CHAINS = ['task', 'flow', 'agent'] as const;
export type RunEvidenceChain = (typeof RUN_EVIDENCE_CHAINS)[number];

export const RUN_EVIDENCE_FILTERS = ['all', ...RUN_EVIDENCE_CHAINS] as const;
export type RunEvidenceFilter = (typeof RUN_EVIDENCE_FILTERS)[number];

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD');

export const runEvidenceQuerySchema = z.object({
  from: daySchema.optional(),
  to: daySchema.optional(),
  chain: z.enum(RUN_EVIDENCE_FILTERS).default('all'),
  format: z.enum(['json', 'markdown', 'csv']).default('json'),
  locale: z.enum(['zh', 'en']).default('zh'),
});
export type RunEvidenceQuery = z.infer<typeof runEvidenceQuerySchema>;

export interface RunFailureCategory {
  code: string;
  count: number;
}

/** 单链路汇总（或 all 的总计） */
export interface RunEvidenceSummary {
  total: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  running: number;
  /** 成功率 = succeeded / 终态数；无终态时为 null */
  successRate: number | null;
  /** 已结束运行耗时的中位数（毫秒）；无可测样本时为 null */
  medianDurationMs: number | null;
  failures: RunFailureCategory[];
}

export interface RunEvidenceChainSummary extends RunEvidenceSummary {
  chain: RunEvidenceChain;
}

export interface RunEvidenceReport {
  /** UTC 日期（YYYY-MM-DD），含首尾 */
  from: string;
  to: string;
  filter: RunEvidenceFilter;
  totals: RunEvidenceSummary;
  chains: RunEvidenceChainSummary[];
  /** v2.11：能力包声明式卡片计算结果（仅 json 响应携带） */
  widgets?: ReportWidgetValue[];
}

export interface ReportWidgetValue {
  id: string;
  title: string;
  chain: RunEvidenceChain;
  metric: string;
  windowDays: number;
  /** 指标值；无样本为 null */
  value: number | null;
  /** failure_top 的失败码；其它指标为 null */
  failureCode?: string | null;
}

export interface RunEvidenceExport {
  filename: string;
  content: string;
  contentType: 'text/markdown; charset=utf-8' | 'text/csv; charset=utf-8';
}
