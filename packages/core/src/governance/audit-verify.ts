import type { AuditEventRow } from '@wbfm/database';
import type { AuditVerifyResult } from '@wbfm/shared/schemas';
import { AUDIT_GENESIS_HASH } from '@wbfm/shared/schemas';

/** v2.14：审计链重算（无副作用；调用方决定是否写回 audit_verified） */

export interface AuditVerifySource {
  count(): number;
  listAscending(afterSeq?: number, limit?: number): AuditEventRow[];
}

export interface AuditVerifyOptions {
  /** 只校验最近 N 条（链头从首条 prev_hash 续起） */
  maxEvents?: number;
}

export function verifyAuditChain(
  source: AuditVerifySource,
  recompute: (prevHash: string, row: AuditEventRow) => string,
  options: AuditVerifyOptions = {},
): AuditVerifyResult {
  const total = options.maxEvents !== undefined ? source.count() : 0;
  const truncated = options.maxEvents !== undefined && total > options.maxEvents;
  let expectedSeq = 1;
  let prevHash = AUDIT_GENESIS_HASH;
  let checked = 0;
  let firstBrokenSeq: number | null = null;
  let afterSeq = 0;

  if (truncated && options.maxEvents !== undefined) {
    const startSeq = total - options.maxEvents + 1;
    const first = source.listAscending(startSeq - 1, 1)[0];
    if (!first || first.seq !== startSeq) {
      firstBrokenSeq = startSeq;
    } else {
      expectedSeq = first.seq;
      prevHash = first.prev_hash;
      afterSeq = first.seq - 1;
    }
  }

  if (firstBrokenSeq === null) {
    for (;;) {
      const rows = source.listAscending(afterSeq);
      if (rows.length === 0) break;
      for (const row of rows) {
        if (row.seq !== expectedSeq) {
          firstBrokenSeq = expectedSeq;
          break;
        }
        if (row.prev_hash !== prevHash || row.hash !== recompute(prevHash, row)) {
          firstBrokenSeq = row.seq;
          break;
        }
        prevHash = row.hash;
        expectedSeq += 1;
        checked += 1;
      }
      if (firstBrokenSeq !== null) break;
      afterSeq = rows[rows.length - 1]!.seq;
      if (rows.length < 500) break;
    }
  }

  return { ok: firstBrokenSeq === null, checked, firstBrokenSeq };
}
