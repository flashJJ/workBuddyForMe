import { describe, expect, it } from 'vitest';
import type { ProviderHealthRow } from '@wbfm/shared/schemas';
import {
  buildHealthCsv,
  buildHealthMarkdown,
  formatFailureCodes,
  healthExportFilename,
  type HealthExportLabels,
} from './provider-health-export';

const labels: HealthExportLabels = {
  title: '供应商健康度',
  provider: '供应商',
  status: '状态',
  failures: '失败总数',
  codes: '错误码次数',
  switches: '切换次数',
  lastFailure: '最近失败时间',
  enabled: '启用',
  disabled: '已停用',
  unknown: '未知',
  none: '—',
};

const rows: ProviderHealthRow[] = [
  {
    providerId: 'p1',
    providerName: '主供应商',
    enabled: true,
    failures: { timeout: 2, rate_limited: 1 },
    failureTotal: 3,
    switches: 1,
    lastFailureAt: '2026-11-22T01:02:03.000Z',
  },
  {
    providerId: 'p2',
    providerName: '备用,供应商"B"',
    enabled: false,
    failures: {},
    failureTotal: 0,
    switches: 0,
    lastFailureAt: null,
  },
];

describe('v4.20 健康度导出', () => {
  it('文件名按本地日期：provider-health-YYYYMMDD', () => {
    const now = new Date(2026, 10, 22);
    expect(healthExportFilename('md', now)).toBe('provider-health-20261122.md');
    expect(healthExportFilename('csv', now)).toBe('provider-health-20261122.csv');
  });

  it('Markdown 表包含六列且不含正文', () => {
    const text = buildHealthMarkdown(rows, labels, (code) => (code === 'timeout' ? '超时' : code));
    expect(text).toContain('| 供应商 | 状态 | 失败总数 | 错误码次数 | 切换次数 | 最近失败时间 |');
    expect(text).toContain('| 主供应商 | 启用 | 3 | 超时×2; rate_limited×1 | 1 |');
    expect(text).toContain('| 备用,供应商"B" | 已停用 | 0 | — | 0 | — |');
  });

  it('CSV 按 RFC4180 转义逗号与引号', () => {
    const csv = buildHealthCsv(rows, labels);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('供应商,状态,失败总数,错误码次数,切换次数,最近失败时间');
    expect(lines[2]).toBe('"备用,供应商""B""",已停用,0,—,0,—');
  });

  it('错误码列无失败时显示占位符', () => {
    expect(formatFailureCodes(rows[1]!, labels)).toBe('—');
  });
});
