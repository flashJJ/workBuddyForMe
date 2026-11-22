import type { ProviderHealthRow } from '@wbfm/shared/schemas';

/** v4.20：健康度导出（Markdown / CSV），只使用面板报告数据，不含正文与路径 */

export type HealthExportFormat = 'md' | 'csv';

export interface HealthExportLabels {
  title: string;
  provider: string;
  status: string;
  failures: string;
  codes: string;
  switches: string;
  lastFailure: string;
  enabled: string;
  disabled: string;
  unknown: string;
  none: string;
}

/** 文件名：`provider-health-<YYYYMMDD>.md|csv`（本地时区） */
export function healthExportFilename(format: HealthExportFormat, now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return `provider-health-${date}.${format}`;
}

export function healthStatusLabel(row: ProviderHealthRow, labels: HealthExportLabels): string {
  if (row.enabled === null) return labels.unknown;
  return row.enabled ? labels.enabled : labels.disabled;
}

/** 错误码列：`超时×2; 限流×1`，无失败显示 `—` */
export function formatFailureCodes(
  row: ProviderHealthRow,
  labels: HealthExportLabels,
  codeLabel?: (code: string) => string,
): string {
  const entries = Object.entries(row.failures).filter(([, count]) => count > 0);
  if (entries.length === 0) return labels.none;
  return entries
    .map(([code, count]) => `${codeLabel ? codeLabel(code) : code}×${count}`)
    .join('; ');
}

function lastFailureText(row: ProviderHealthRow, labels: HealthExportLabels): string {
  return row.lastFailureAt ? new Date(row.lastFailureAt).toISOString() : labels.none;
}

export function buildHealthMarkdown(
  rows: readonly ProviderHealthRow[],
  labels: HealthExportLabels,
  codeLabel?: (code: string) => string,
): string {
  const header =
    `| ${labels.provider} | ${labels.status} | ${labels.failures} | ${labels.codes} | ` +
    `${labels.switches} | ${labels.lastFailure} |`;
  const divider = '| --- | --- | --- | --- | --- | --- |';
  const body = rows.map(
    (row) =>
      `| ${row.providerName} | ${healthStatusLabel(row, labels)} | ${row.failureTotal} | ` +
      `${formatFailureCodes(row, labels, codeLabel)} | ${row.switches} | ` +
      `${lastFailureText(row, labels)} |`,
  );
  return [`# ${labels.title}`, '', header, divider, ...body, ''].join('\n');
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function buildHealthCsv(
  rows: readonly ProviderHealthRow[],
  labels: HealthExportLabels,
  codeLabel?: (code: string) => string,
): string {
  const header = [
    labels.provider,
    labels.status,
    labels.failures,
    labels.codes,
    labels.switches,
    labels.lastFailure,
  ];
  const lines = rows.map((row) => [
    row.providerName,
    healthStatusLabel(row, labels),
    String(row.failureTotal),
    formatFailureCodes(row, labels, codeLabel),
    String(row.switches),
    lastFailureText(row, labels),
  ]);
  return [header, ...lines].map((line) => line.map(csvField).join(',')).join('\n');
}
