import type { DatabaseInstance } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import type {
  RunEvidenceChain,
  RunEvidenceChainSummary,
  RunEvidenceExport,
  RunEvidenceFilter,
  RunEvidenceQuery,
  RunEvidenceReport,
  RunEvidenceSummary,
} from '@wbfm/shared/schemas';
import { RUN_EVIDENCE_CHAINS } from '@wbfm/shared/schemas';
import { buildRunEvidenceExport } from './run-evidence-export';

/**
 * v2.6 M5 P1-2：运行证据汇总。
 * 只读 task_runs / workflow_runs / agent_runs 三张既有表，不新增运行表；
 * 按 UTC 自然日窗口统计成功率、耗时中位数与失败类别 Top N。
 */

type Outcome = 'succeeded' | 'failed' | 'cancelled' | 'running';

interface RunRow {
  status: string;
  reason: string | null;
  started: string;
  finished: string | null;
}

interface Bucket {
  total: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  running: number;
  durations: number[];
  failures: Map<string, number>;
}

const MAX_FAILURE_CATEGORIES = 5;

function emptyBucket(): Bucket {
  return {
    total: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    running: 0,
    durations: [],
    failures: new Map(),
  };
}

function dayIso(day: string): string {
  return `${day}T00:00:00.000Z`;
}

function nextDayIso(day: string): string {
  const date = new Date(dayIso(day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBefore(day: string, days: number): string {
  const date = new Date(dayIso(day));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function durationMs(started: string, finished: string | null): number | null {
  if (!finished) return null;
  const start = Date.parse(started);
  const end = Date.parse(finished);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return end - start;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

function addRow(bucket: Bucket, outcome: Outcome, failure: string | null, duration: number | null): void {
  bucket.total += 1;
  bucket[outcome] += 1;
  if (outcome === 'failed' && failure) {
    bucket.failures.set(failure, (bucket.failures.get(failure) ?? 0) + 1);
  }
  if (outcome !== 'running' && duration !== null) bucket.durations.push(duration);
}

function summarize(bucket: Bucket): RunEvidenceSummary {
  const terminal = bucket.succeeded + bucket.failed + bucket.cancelled;
  return {
    total: bucket.total,
    succeeded: bucket.succeeded,
    failed: bucket.failed,
    cancelled: bucket.cancelled,
    running: bucket.running,
    successRate: terminal === 0 ? null : Math.round((bucket.succeeded / terminal) * 10_000) / 100,
    medianDurationMs: median(bucket.durations),
    failures: [...bucket.failures.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
      .slice(0, MAX_FAILURE_CATEGORIES),
  };
}

function mergeBuckets(buckets: Bucket[]): Bucket {
  const merged = emptyBucket();
  for (const bucket of buckets) {
    merged.total += bucket.total;
    merged.succeeded += bucket.succeeded;
    merged.failed += bucket.failed;
    merged.cancelled += bucket.cancelled;
    merged.running += bucket.running;
    merged.durations.push(...bucket.durations);
    for (const [code, count] of bucket.failures) {
      merged.failures.set(code, (merged.failures.get(code) ?? 0) + count);
    }
  }
  return merged;
}

function taskOutcome(status: string, reason: string | null): { outcome: Outcome; failure: string | null } {
  if (status === 'completed') return { outcome: 'succeeded', failure: null };
  if (status === 'failed') return { outcome: 'failed', failure: reason ?? 'failed' };
  if (status === 'stopped') {
    return reason === 'user_stop'
      ? { outcome: 'cancelled', failure: null }
      : { outcome: 'failed', failure: reason ?? 'stopped' };
  }
  return { outcome: 'running', failure: null };
}

function flowOutcome(status: string, errorJson: string | null): { outcome: Outcome; failure: string | null } {
  if (status === 'succeeded') return { outcome: 'succeeded', failure: null };
  if (status === 'failed' || status === 'interrupted') {
    return { outcome: 'failed', failure: errorCode(errorJson) ?? status };
  }
  if (status === 'cancelled') return { outcome: 'cancelled', failure: null };
  return { outcome: 'running', failure: null };
}

function errorCode(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { code?: unknown };
    return typeof parsed.code === 'string' && parsed.code.trim() ? parsed.code.trim() : null;
  } catch {
    return null;
  }
}

function agentOutcome(status: string, code: string | null): { outcome: Outcome; failure: string | null } {
  if (status === 'done') return { outcome: 'succeeded', failure: null };
  if (status === 'failed') return { outcome: 'failed', failure: code ?? 'failed' };
  if (status === 'budget_exceeded') return { outcome: 'failed', failure: 'budget_exceeded' };
  if (status === 'cancelled') return { outcome: 'cancelled', failure: null };
  return { outcome: 'running', failure: null };
}

interface NormalizedWindow {
  from: string;
  to: string;
  fromIso: string;
  toIso: string;
}

function normalizeWindow(query: RunEvidenceQuery): NormalizedWindow {
  const to = query.to ?? todayUtc();
  const from = query.from ?? daysBefore(to, 6);
  if (from > to) throw ApiError.validation('开始日期不能晚于结束日期');
  return { from, to, fromIso: dayIso(from), toIso: nextDayIso(to) };
}

function taskRows(db: DatabaseInstance, window: NormalizedWindow): RunRow[] {
  return db
    .prepare(
      `SELECT status, stop_reason AS reason, created_at AS started, finished_at AS finished
         FROM task_runs WHERE created_at >= ? AND created_at < ?`,
    )
    .all(window.fromIso, window.toIso) as RunRow[];
}

function flowRows(db: DatabaseInstance, window: NormalizedWindow): Array<RunRow & { errorJson: string | null }> {
  return db
    .prepare(
      `SELECT status, error_json AS errorJson,
              COALESCE(started_at, created_at) AS started, finished_at AS finished
         FROM workflow_runs WHERE created_at >= ? AND created_at < ?`,
    )
    .all(window.fromIso, window.toIso) as Array<RunRow & { errorJson: string | null }>;
}

function agentRows(db: DatabaseInstance, window: NormalizedWindow): Array<RunRow & { code: string | null }> {
  return db
    .prepare(
      `SELECT status, error_code AS code, created_at AS started, updated_at AS finished
         FROM agent_runs WHERE created_at >= ? AND created_at < ?`,
    )
    .all(window.fromIso, window.toIso) as Array<RunRow & { code: string | null }>;
}

function bucketOf(chain: RunEvidenceChain, db: DatabaseInstance, window: NormalizedWindow): Bucket {
  const bucket = emptyBucket();
  if (chain === 'task') {
    for (const row of taskRows(db, window)) {
      const mapped = taskOutcome(row.status, row.reason);
      addRow(bucket, mapped.outcome, mapped.failure, durationMs(row.started, row.finished));
    }
  } else if (chain === 'flow') {
    for (const row of flowRows(db, window)) {
      const mapped = flowOutcome(row.status, row.errorJson);
      addRow(bucket, mapped.outcome, mapped.failure, durationMs(row.started, row.finished));
    }
  } else {
    for (const row of agentRows(db, window)) {
      const mapped = agentOutcome(row.status, row.code);
      addRow(bucket, mapped.outcome, mapped.failure, durationMs(row.started, row.finished));
    }
  }
  return bucket;
}


export interface RunEvidenceService {
  report(query: RunEvidenceQuery): RunEvidenceReport;
  exportReport(query: RunEvidenceQuery, format: 'markdown' | 'csv'): RunEvidenceExport;
}

export function createRunEvidenceService(deps: { db: DatabaseInstance }): RunEvidenceService {
  function report(query: RunEvidenceQuery): RunEvidenceReport {
    const window = normalizeWindow(query);
    const chains: RunEvidenceChain[] =
      query.chain === 'all' ? [...RUN_EVIDENCE_CHAINS] : [query.chain];
    const buckets = new Map<RunEvidenceChain, Bucket>(
      chains.map((chain) => [chain, bucketOf(chain, deps.db, window)]),
    );
    const chainSummaries: RunEvidenceChainSummary[] = chains.map((chain) => ({
      chain,
      ...summarize(buckets.get(chain)!),
    }));
    return {
      from: window.from,
      to: window.to,
      filter: query.chain,
      totals: summarize(mergeBuckets([...buckets.values()])),
      chains: chainSummaries,
    };
  }

  function exportReport(query: RunEvidenceQuery, format: 'markdown' | 'csv'): RunEvidenceExport {
    return buildRunEvidenceExport(report(query), query, format);
  }

  return { report, exportReport };
}

export type { RunEvidenceFilter };
