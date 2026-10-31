import { createHash } from 'node:crypto';
import { ApiError } from '@wbfm/shared/errors';
import {
  DIAGNOSTIC_FORMAT_VERSION,
  type CapabilityHealthReport,
  type CapabilityView,
  type DiagnosticEntry,
  type DiagnosticManifest,
} from '@wbfm/shared/schemas';
import { APP_VERSION } from '@wbfm/shared/version';
import type { AppSettings } from '@wbfm/shared/types';
import {
  LATEST_SCHEMA_VERSION,
  getSchemaVersion,
  type DatabaseInstance,
  type SessionEventView,
} from '@wbfm/database';
import { agentPolicyHash } from '../governance/policy';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ERROR_EVENTS = 200;
const ERROR_LINE_MAX = 500;
const AUDIT_MAX_EVENTS = 100_000;

export interface DiagnosticFile {
  path: string;
  content: string;
}

export interface DiagnosticBundle {
  generatedAt: string;
  manifest: DiagnosticManifest;
  files: DiagnosticFile[];
}

export interface DiagnosticsSources {
  db: DatabaseInstance;
  settings: AppSettings;
  audit?: {
    verify(options?: { record?: boolean; maxEvents?: number }): {
      ok: boolean;
      checked: number;
      firstBrokenSeq: number | null;
    };
    count(): number;
  };
  capabilities?: {
    list(): CapabilityView[];
    health(): CapabilityHealthReport;
  };
  sessions?: {
    listAll(filter: { limit?: number }): SessionEventView[];
  };
}

export interface DiagnosticsOptions {
  /** 生成预算（默认 30 秒；<=0 立即超时，仅测试使用） */
  timeoutMs?: number;
}

const ERROR_EVENT_PATTERN = /error|failed|blocked|denied|timeout/i;
const SAFE_CODE_PATTERN = /^[A-Za-z0-9_.-]{1,40}$/;

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function assertWithinBudget(deadline: number): void {
  if (Date.now() >= deadline) {
    throw new ApiError('DIAGNOSTICS_TIMEOUT', '诊断包生成超时');
  }
}

function buildVersions(db: DatabaseInstance): string {
  return JSON.stringify(
    {
      appVersion: APP_VERSION,
      schemaVersionLatest: LATEST_SCHEMA_VERSION,
      schemaVersionActual: getSchemaVersion(db),
      node: process.version,
      electron: process.versions.electron ?? null,
      platform: process.platform,
      arch: process.arch,
    },
    null,
    2,
  );
}

function buildAuditVerify(sources: DiagnosticsSources): string {
  const maxEvents = AUDIT_MAX_EVENTS;
  let result: { ok: boolean; checked: number; firstBrokenSeq: number | null };
  let total = 0;
  try {
    if (sources.audit) {
      total = sources.audit.count();
      result = sources.audit.verify({ record: false, maxEvents });
    } else {
      result = { ok: true, checked: 0, firstBrokenSeq: null };
    }
  } catch {
    result = { ok: false, checked: 0, firstBrokenSeq: null };
  }
  return JSON.stringify(
    {
      ok: result.ok,
      checked: result.checked,
      firstBrokenSeq: result.firstBrokenSeq,
      truncated: total > maxEvents,
    },
    null,
    2,
  );
}

function buildCapabilities(sources: DiagnosticsSources): string {
  const packs = sources.capabilities?.list() ?? [];
  let issuesById = new Map<string, string[]>();
  try {
    const health = sources.capabilities?.health();
    issuesById = new Map(
      (health?.packs ?? []).map((pack) => [pack.id, pack.issues.map((issue) => issue.code)]),
    );
  } catch {
    /* 健康自检失败不阻断诊断包：保留空问题列表 */
  }
  return JSON.stringify(
    packs.map((pack) => ({
      id: pack.id,
      kind: pack.kind,
      version: pack.version,
      status: pack.status,
      healthIssues: issuesById.get(pack.id) ?? [],
    })),
    null,
    2,
  );
}

function buildRunsSummary(db: DatabaseInstance): string {
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const rows = db
    .prepare('SELECT status, COUNT(*) AS n FROM task_runs WHERE created_at >= ? GROUP BY status')
    .all(since) as Array<{ status: string; n: number }>;
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    byStatus[row.status] = row.n;
    total += row.n;
  }
  const scheduled = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM task_runs
         WHERE created_at >= ? AND origin_scheduled_task_id IS NOT NULL`,
      )
      .get(since) as { n: number }
  ).n;
  return JSON.stringify(
    {
      windowDays: 7,
      byStatus,
      totalRunCount: total,
      scheduledRunCount: scheduled,
    },
    null,
    2,
  );
}

function buildSettingsSummary(sources: DiagnosticsSources): string {
  const { db, settings } = sources;
  const providerCount = (
    db.prepare('SELECT COUNT(*) AS n FROM providers').get() as { n: number }
  ).n;
  const modelCount = (db.prepare('SELECT COUNT(*) AS n FROM models').get() as { n: number }).n;
  const workspaceConfigured = Boolean(
    db.prepare('SELECT 1 AS hit FROM task_runs WHERE workspace_path IS NOT NULL LIMIT 1').get(),
  );
  const policy = settings.agentPolicy;
  return JSON.stringify(
    {
      providerCount,
      modelCount,
      policyHash: policy ? agentPolicyHash(policy) : null,
      defaultMode: policy?.defaultMode ?? 'confirm_each',
      workspaceConfigured,
      features: {
        demoModeEnabled: Boolean(settings.demoModeEnabled),
        emotionEnabled: settings.emotionEnabled !== false,
        relationshipEnabled: settings.relationshipEnabled !== false,
        interactionLinesEnabled: settings.interactionLinesEnabled !== false,
        autoCompile: settings.autoCompile !== false,
        compileWithLlm: Boolean(settings.compileWithLlm),
        hybridRetrievalEnabled: settings.hybridRetrievalEnabled !== false,
        capabilitySignaturePolicy: settings.capabilitySignaturePolicy ?? 'off',
      },
    },
    null,
    2,
  );
}

function safeErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const nested = record.error;
  const candidate =
    nested && typeof nested === 'object'
      ? (nested as Record<string, unknown>).code
      : record.code;
  return typeof candidate === 'string' && SAFE_CODE_PATTERN.test(candidate) ? candidate : null;
}

function buildErrorsLog(sources: DiagnosticsSources): string {
  let events: SessionEventView[] = [];
  try {
    events = sources.sessions?.listAll({ limit: 1000 }) ?? [];
  } catch {
    events = [];
  }
  return events
    .filter((event) => ERROR_EVENT_PATTERN.test(event.type))
    .slice(0, MAX_ERROR_EVENTS)
    .map((event) => {
      const type = event.type.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 60);
      const code = safeErrorCode(event.payload);
      const line = `${event.createdAt} ${event.scope} ${type}${code ? ` ${code}` : ''}`;
      return line.slice(0, ERROR_LINE_MAX);
    })
    .join('\n');
}

const README = [
  'WorkBuddyForMe 诊断包（format 1）。',
  '仅包含应用与迁移版本、审计链校验结果、能力健康、最近 7 天运行统计、配置摘要与错误事件类型。',
  '不含 API Key、令牌、密码、对话与记忆正文、绝对路径、域名清单或会话 / 运行 id。',
].join('\n');

export function collectDiagnostics(
  sources: DiagnosticsSources,
  options: DiagnosticsOptions = {},
): DiagnosticBundle {
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  assertWithinBudget(deadline);

  const generatedAt = new Date().toISOString();
  const contents: DiagnosticFile[] = [];
  const add = (path: string, content: string) => {
    assertWithinBudget(deadline);
    contents.push({ path, content });
  };

  add('versions.json', buildVersions(sources.db));
  add('audit-verify.json', buildAuditVerify(sources));
  add('capabilities.json', buildCapabilities(sources));
  add('runs-summary.json', buildRunsSummary(sources.db));
  add('settings-summary.json', buildSettingsSummary(sources));
  add('errors.log', buildErrorsLog(sources));
  add('README.txt', README);

  const entries: DiagnosticEntry[] = contents.map((file) => ({
    path: file.path,
    size: Buffer.byteLength(file.content, 'utf8'),
    sha256: sha256(file.content),
  }));
  const manifest: DiagnosticManifest = {
    formatVersion: DIAGNOSTIC_FORMAT_VERSION,
    appVersion: APP_VERSION,
    schemaVersion: getSchemaVersion(sources.db),
    platform: process.platform,
    arch: process.arch,
    generatedAt,
    entries,
  };
  const manifestFile = { path: 'manifest.json', content: JSON.stringify(manifest, null, 2) };
  return {
    generatedAt,
    manifest,
    files: [...contents, manifestFile],
  };
}
