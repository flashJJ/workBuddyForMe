import { createAuditEventRepository, type DatabaseInstance } from '@wbfm/database';
import type { AuditAnchor, AuditAnchorVerifyResult } from '@wbfm/shared/schemas';

/** v2.15 M2：外部锚点只读校验；不写 audit_verified，不修改账本 */

export function verifyAuditAnchor(
  db: DatabaseInstance,
  anchor: AuditAnchor,
): AuditAnchorVerifyResult {
  const repo = createAuditEventRepository(db);
  const tail = repo.tail();
  const current = { lastSeq: tail?.seq ?? null, lastHash: tail?.hash ?? null };
  let code: AuditAnchorVerifyResult['code'] = 'ANCHOR_OK';

  if (anchor.ledger.lastSeq !== null) {
    if (tail === null || tail.seq < anchor.ledger.lastSeq) {
      code = 'ANCHOR_TAIL_TRUNCATED';
    } else {
      const row = repo.getBySeq(anchor.ledger.lastSeq);
      if (!row || row.hash !== anchor.ledger.lastHash) code = 'ANCHOR_MISMATCH';
    }
  }

  if (code === 'ANCHOR_OK' && anchor.range.count > 0) {
    const count = repo.countRange(anchor.range.from, anchor.range.to);
    const last =
      anchor.range.lastSeq === null ? null : repo.getBySeq(anchor.range.lastSeq);
    if (count !== anchor.range.count || !last || last.hash !== anchor.range.lastHash) {
      code = 'ANCHOR_MISMATCH';
    }
  }

  if (code === 'ANCHOR_OK' && !anchor.range.chain.ok) {
    code = 'ANCHOR_CHAIN_BROKEN';
  }

  return { ok: code === 'ANCHOR_OK', code, anchor, current };
}
