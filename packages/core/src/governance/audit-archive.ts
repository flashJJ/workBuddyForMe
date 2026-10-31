import { ApiError } from '@wbfm/shared/errors';
import {
  AUDIT_ARCHIVE_LIMITS,
  canonicalJson,
  type AuditAnchor,
  type AuditArchiveQuery,
} from '@wbfm/shared/schemas';
import {
  createAuditEventRepository,
  type AuditEventRow,
  type DatabaseInstance,
} from '@wbfm/database';
import { mapRow, type AuditService } from './audit';

/** v2.15 M2：审计归档区间组装（JSONL + 锚点），不写账本 */

export interface AuditArchiveDeps {
  db: DatabaseInstance;
  audit: AuditService;
  appVersion: string;
  schemaVersion: number;
  /** 测试注入：覆盖 shared 常量 */
  maxEvents?: number;
  maxRangeDays?: number;
  maxChainEvents?: number;
}

export interface AuditArchiveBundle {
  eventsJsonl: string;
  anchor: AuditAnchor;
}

function assertRange(range: AuditArchiveQuery, maxRangeDays: number): void {
  const fromMs = Date.parse(range.from);
  const toMs = Date.parse(range.to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    throw ApiError.validation('归档时间区间不合法');
  }
  if (fromMs > toMs) throw ApiError.validation('归档起始时间不能晚于结束时间');
  if (toMs - fromMs > maxRangeDays * 86_400_000) {
    throw new ApiError('AUDIT_ARCHIVE_TOO_LARGE', `归档区间超过 ${maxRangeDays} 天上限`, {
      reason: 'range',
      maxRangeDays,
    });
  }
}

function readRows(
  db: DatabaseInstance,
  range: AuditArchiveQuery,
  maxEvents: number,
): AuditEventRow[] {
  const repo = createAuditEventRepository(db);
  const count = repo.countRange(range.from, range.to);
  if (count > maxEvents) {
    throw new ApiError('AUDIT_ARCHIVE_TOO_LARGE', `归档事件数超过 ${maxEvents} 条上限`, {
      reason: 'events',
      count,
      maxEvents,
    });
  }
  const rows: AuditEventRow[] = [];
  let afterSeq = 0;
  for (;;) {
    const batch = repo.listRangeAscending({
      from: range.from,
      to: range.to,
      afterSeq,
      limit: 1000,
    });
    rows.push(...batch);
    if (batch.length < 1000) break;
    afterSeq = batch[batch.length - 1]!.seq;
  }
  return rows;
}

export function buildAuditArchive(
  deps: AuditArchiveDeps,
  range: AuditArchiveQuery,
): AuditArchiveBundle {
  const maxRangeDays = deps.maxRangeDays ?? AUDIT_ARCHIVE_LIMITS.maxRangeDays;
  const maxEvents = deps.maxEvents ?? AUDIT_ARCHIVE_LIMITS.maxEvents;
  const maxChainEvents = deps.maxChainEvents ?? AUDIT_ARCHIVE_LIMITS.maxChainEvents;
  assertRange(range, maxRangeDays);
  const rows = readRows(deps.db, range, maxEvents);

  const repo = createAuditEventRepository(deps.db);
  const verify = deps.audit.verify({ record: false, maxEvents: maxChainEvents });
  const truncated = deps.audit.count() > maxChainEvents;
  const tail = repo.tail();
  const last = rows.length > 0 ? rows[rows.length - 1]! : null;
  const anchor: AuditAnchor = {
    formatVersion: 1,
    appVersion: deps.appVersion,
    schemaVersion: deps.schemaVersion,
    generatedAt: new Date().toISOString(),
    range: {
      from: range.from,
      to: range.to,
      count: rows.length,
      firstSeq: rows[0]?.seq ?? null,
      lastSeq: last?.seq ?? null,
      lastHash: last?.hash ?? null,
      chain: {
        ok: verify.ok,
        checked: verify.checked,
        firstBrokenSeq: verify.firstBrokenSeq,
        truncated,
      },
    },
    ledger: { lastSeq: tail?.seq ?? null, lastHash: tail?.hash ?? null },
  };

  return {
    eventsJsonl: rows.map((row) => `${canonicalJson(mapRow(row))}\n`).join(''),
    anchor,
  };
}
