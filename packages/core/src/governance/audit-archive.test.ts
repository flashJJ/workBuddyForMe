import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { createAuditService, type AuditService } from './audit';
import { buildAuditArchive } from './audit-archive';
import { verifyAuditAnchor } from './audit-anchor';

const BASE = Date.parse('2026-10-31T00:00:00.000Z');
const RANGE = {
  from: new Date(BASE - 1000).toISOString(),
  to: new Date(BASE + 5000).toISOString(),
};

describe('v2.15 审计归档与外部锚点', () => {
  let db: DatabaseInstance;
  let audit: AuditService;

  beforeEach(() => {
    db = createDatabase();
    audit = createAuditService(db);
  });

  afterEach(() => {
    db.close();
  });

  function appendEvents(count: number): void {
    for (let index = 1; index <= count; index += 1) {
      audit.append({
        kind: 'policy_updated',
        actor: 'user',
        createdAt: new Date(BASE + index * 1000).toISOString(),
        outcome: `event-${index}`,
      });
    }
  }

  function archive() {
    return buildAuditArchive(
      { db, audit, appVersion: '2.15.0', schemaVersion: 42 },
      RANGE,
    );
  }

  it('归档：JSONL 按 seq 升序，锚点记录区间尾与全账本尾', () => {
    appendEvents(3);
    const bundle = archive();
    expect(bundle.eventsJsonl.split('\n').filter(Boolean)).toHaveLength(3);
    expect(bundle.anchor).toMatchObject({
      formatVersion: 1,
      appVersion: '2.15.0',
      schemaVersion: 42,
      range: {
        count: 3,
        firstSeq: 1,
        lastSeq: 3,
        chain: { ok: true, truncated: false },
      },
      ledger: { lastSeq: 3 },
    });
  });

  it('归档：空区间合法；事件上限、区间上限与超限错误码', () => {
    const empty = buildAuditArchive(
      { db, audit, appVersion: '2.15.0', schemaVersion: 42 },
      {
        from: new Date(BASE - 10_000).toISOString(),
        to: new Date(BASE - 5000).toISOString(),
      },
    );
    expect(empty.anchor.range.count).toBe(0);
    expect(empty.anchor.range.firstSeq).toBeNull();
    expect(empty.anchor.range.lastSeq).toBeNull();

    appendEvents(3);
    expect(() =>
      buildAuditArchive(
        { db, audit, appVersion: '2.15.0', schemaVersion: 42, maxEvents: 2 },
        RANGE,
      ),
    ).toThrowError(expect.objectContaining({ code: 'AUDIT_ARCHIVE_TOO_LARGE', status: 422 }));
    expect(() =>
      buildAuditArchive(
        { db, audit, appVersion: '2.15.0', schemaVersion: 42, maxRangeDays: 0 },
        RANGE,
      ),
    ).toThrowError(expect.objectContaining({ code: 'AUDIT_ARCHIVE_TOO_LARGE', status: 422 }));
  });

  it('锚点校验：正常通过；尾部删除 → TAIL_TRUNCATED；哈希篡改 → MISMATCH', () => {
    appendEvents(3);
    const bundle = archive();
    expect(verifyAuditAnchor(db, bundle.anchor)).toMatchObject({
      ok: true,
      code: 'ANCHOR_OK',
      current: { lastSeq: 3 },
    });

    db.prepare('DELETE FROM audit_events WHERE seq = 3').run();
    expect(verifyAuditAnchor(db, bundle.anchor)).toMatchObject({
      ok: false,
      code: 'ANCHOR_TAIL_TRUNCATED',
      current: { lastSeq: 2 },
    });

    db.prepare('UPDATE audit_events SET hash = @hash WHERE seq = 3').run({ hash: 'a'.repeat(64) });
    appendEvents(1);
    expect(verifyAuditAnchor(db, bundle.anchor)).toMatchObject({
      ok: false,
      code: 'ANCHOR_MISMATCH',
    });
  });

  it('锚点校验：生成时链已断 → CHAIN_BROKEN；空账本锚点不要求当前仍为空', () => {
    appendEvents(3);
    db.prepare('UPDATE audit_events SET hash = @hash WHERE seq = 2').run({ hash: 'b'.repeat(64) });
    const broken = archive();
    expect(broken.anchor.range.chain).toMatchObject({ ok: false, firstBrokenSeq: 2 });
    const brokenResult = verifyAuditAnchor(db, broken.anchor);
    expect(brokenResult.ok).toBe(false);
    expect(brokenResult.code).toBe('ANCHOR_CHAIN_BROKEN');

    const emptyDb = createDatabase();
    const emptyAudit = createAuditService(emptyDb);
    const emptyAnchor = buildAuditArchive(
      { db: emptyDb, audit: emptyAudit, appVersion: '2.15.0', schemaVersion: 42 },
      RANGE,
    ).anchor;
    emptyAudit.append({ kind: 'policy_updated', actor: 'user' });
    expect(verifyAuditAnchor(emptyDb, emptyAnchor)).toMatchObject({
      ok: true,
      code: 'ANCHOR_OK',
      current: { lastSeq: 1 },
    });
    emptyDb.close();
  });

  it('锚点校验：链校验截断标记随全账本条数变化', () => {
    appendEvents(3);
    const bundle = buildAuditArchive(
      {
        db,
        audit,
        appVersion: '2.15.0',
        schemaVersion: 42,
        maxChainEvents: 1,
      },
      RANGE,
    );
    expect(bundle.anchor.range.chain).toMatchObject({
      ok: true,
      checked: 1,
      truncated: true,
    });
  });
});
