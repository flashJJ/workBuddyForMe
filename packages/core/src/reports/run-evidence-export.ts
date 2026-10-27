import type {
  RunEvidenceChain,
  RunEvidenceExport,
  RunEvidenceQuery,
  RunEvidenceReport,
} from '@wbfm/shared/schemas';

/** v2.6 M5：运行报告的 Markdown / CSV 渲染（纯函数，便于单测与复用） */

export type RunEvidenceExportFormat = 'markdown' | 'csv';

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

const EXPORT_LABELS = {
  zh: {
    title: '运行报告',
    window: '时间窗（UTC）',
    filter: '链路',
    chain: '链路',
    total: '总数',
    succeeded: '成功',
    failed: '失败',
    cancelled: '取消',
    running: '运行中',
    successRate: '成功率',
    median: '中位耗时',
    failures: '失败类别 Top',
    none: '无',
    all: '全部',
  },
  en: {
    title: 'Run report',
    window: 'Window (UTC)',
    filter: 'Chain',
    chain: 'Chain',
    total: 'Total',
    succeeded: 'Succeeded',
    failed: 'Failed',
    cancelled: 'Cancelled',
    running: 'Running',
    successRate: 'Success rate',
    median: 'Median duration',
    failures: 'Top failures',
    none: 'none',
    all: 'all',
  },
} as const;

function chainLabel(chain: RunEvidenceChain): string {
  return chain;
}

export function buildRunEvidenceExport(
  report: RunEvidenceReport,
  query: Pick<RunEvidenceQuery, 'locale' | 'chain'>,
  format: RunEvidenceExportFormat,
): RunEvidenceExport {
  const labels = EXPORT_LABELS[query.locale];
  const filterLabel = query.chain === 'all' ? labels.all : chainLabel(query.chain);

  if (format === 'markdown') {
    const lines = [
      `# ${labels.title}`,
      '',
      `- ${labels.window}: ${report.from} ~ ${report.to}`,
      `- ${labels.filter}: ${filterLabel}`,
      '',
      `| ${labels.chain} | ${labels.total} | ${labels.succeeded} | ${labels.failed} | ${labels.cancelled} | ${labels.running} | ${labels.successRate} | ${labels.median} |`,
      '|---|---|---|---|---|---|---|---|',
    ];
    for (const chain of report.chains) {
      lines.push(
        `| ${chain.chain} | ${chain.total} | ${chain.succeeded} | ${chain.failed} | ${chain.cancelled} | ${chain.running} | ${
          chain.successRate === null ? '—' : `${chain.successRate}%`
        } | ${formatDuration(chain.medianDurationMs)} |`,
      );
    }
    lines.push('', `## ${labels.failures}`, '');
    let hasFailure = false;
    for (const chain of report.chains) {
      for (const failure of chain.failures) {
        hasFailure = true;
        lines.push(`- ${chain.chain} · ${failure.code}: ${failure.count}`);
      }
    }
    if (!hasFailure) lines.push(labels.none);
    return {
      filename: `run-report-${report.from}_${report.to}.md`,
      content: `${lines.join('\n')}\n`,
      contentType: 'text/markdown; charset=utf-8',
    };
  }

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = [
    [labels.chain, labels.total, labels.succeeded, labels.failed, labels.cancelled, labels.running, labels.successRate, labels.median],
    ...report.chains.map((chain) => [
      chain.chain,
      chain.total,
      chain.succeeded,
      chain.failed,
      chain.cancelled,
      chain.running,
      chain.successRate === null ? '' : String(chain.successRate),
      chain.medianDurationMs === null ? '' : String(chain.medianDurationMs),
    ]),
    [
      'all',
      report.totals.total,
      report.totals.succeeded,
      report.totals.failed,
      report.totals.cancelled,
      report.totals.running,
      report.totals.successRate === null ? '' : String(report.totals.successRate),
      report.totals.medianDurationMs === null ? '' : String(report.totals.medianDurationMs),
    ],
  ];
  return {
    filename: `run-report-${report.from}_${report.to}.csv`,
    content: `\uFEFF${rows.map((row) => row.map((cell) => escape(String(cell))).join(',')).join('\n')}\n`,
    contentType: 'text/csv; charset=utf-8',
  };
}
