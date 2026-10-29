import { createReportWidgetRepository, type DatabaseInstance } from '@wbfm/database';
import {
  reportWidgetCapabilityPayloadSchema,
  type ReportWidgetValue,
  type RunEvidenceSummary,
} from '@wbfm/shared/schemas';
import { createRunEvidenceService } from './run-evidence-service';

function valueOf(summary: RunEvidenceSummary, metric: string, windowDays: number): {
  value: number | null;
  failureCode: string | null;
} {
  if (metric === 'success_rate') return { value: summary.successRate, failureCode: null };
  if (metric === 'run_count') return { value: summary.total, failureCode: null };
  if (metric === 'median_duration') return { value: summary.medianDurationMs, failureCode: null };
  if (metric === 'failure_top') {
    const top = summary.failures[0];
    return { value: top?.count ?? null, failureCode: top?.code ?? null };
  }
  void windowDays;
  return { value: null, failureCode: null };
}

function dayBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

/** v2.11：按启用的能力包卡片计算指标（复用运行证据汇总口径） */
export function listReportWidgetValues(db: DatabaseInstance, now = new Date()): ReportWidgetValue[] {
  const repo = createReportWidgetRepository(db);
  const service = createRunEvidenceService({ db });
  const to = now.toISOString().slice(0, 10);

  return repo.listEnabled().flatMap((row) => {
    let parsed: ReturnType<typeof reportWidgetCapabilityPayloadSchema.safeParse>;
    try {
      parsed = reportWidgetCapabilityPayloadSchema.safeParse(JSON.parse(row.configJson));
    } catch {
      return [];
    }
    if (!parsed.success) return [];
    const config = parsed.data;
    const report = service.report({
      from: dayBefore(now, config.windowDays - 1),
      to,
      chain: config.chain,
      format: 'json',
      locale: 'zh',
    });
    const summary = report.chains[0];
    if (!summary) return [];
    const computed = valueOf(summary, config.metric, config.windowDays);
    return [
      {
        id: row.id,
        title: row.title,
        chain: config.chain,
        metric: config.metric,
        windowDays: config.windowDays,
        value: computed.value,
        failureCode: computed.failureCode,
      },
    ];
  });
}
