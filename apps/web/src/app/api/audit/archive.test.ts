import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { setDataRootForTest, resetDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest, getServices } from '@/lib/server/container';
import { GET as exportArchive } from './archive/route';
import { POST as verifyAnchor } from './anchor/verify/route';

const BASE = Date.parse('2026-10-31T00:00:00.000Z');
const RANGE = {
  from: new Date(BASE - 1000).toISOString(),
  to: new Date(BASE + 5000).toISOString(),
};

describe('审计归档与锚点路由（v2.15）', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-web-audit-archive-')));
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  function appendEvents(count: number): void {
    for (let index = 1; index <= count; index += 1) {
      getServices().audit.append({
        kind: 'policy_updated',
        actor: 'user',
        createdAt: new Date(BASE + index * 1000).toISOString(),
        outcome: `event-${index}`,
      });
    }
  }

  async function readArchive() {
    const url = `http://x/api/audit/archive?from=${encodeURIComponent(RANGE.from)}&to=${encodeURIComponent(RANGE.to)}`;
    const response = await exportArchive(new Request(url), {} as never);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const anchor = JSON.parse(strFromU8(files['anchor.json']!)) as {
      formatVersion: number;
      range: { count: number; lastSeq: number | null };
      ledger: { lastSeq: number | null };
    };
    expect(files['events.jsonl']).toBeTruthy();
    return { anchor, response };
  }

  it('GET archive：返回 JSONL + anchor，且不写审计事件', async () => {
    appendEvents(3);
    const { anchor } = await readArchive();
    expect(anchor.formatVersion).toBe(1);
    expect(anchor.range).toMatchObject({ count: 3, lastSeq: 3 });
    expect(anchor.ledger.lastSeq).toBe(3);
    const verified = getServices().audit.list({ kind: 'audit_verified', limit: 10 });
    expect(verified.events).toEqual([]);
  });

  it('POST anchor/verify：正常通过；删除尾部后返回 TAIL_TRUNCATED', async () => {
    appendEvents(3);
    const { anchor } = await readArchive();
    const okResponse = await verifyAnchor(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(anchor),
      }),
      {} as never,
    );
    expect(okResponse.status).toBe(200);
    expect((await okResponse.json()).data).toMatchObject({
      ok: true,
      code: 'ANCHOR_OK',
      current: { lastSeq: 3 },
    });

    db.prepare('DELETE FROM audit_events WHERE seq = 3').run();
    const truncated = await verifyAnchor(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(anchor),
      }),
      {} as never,
    );
    expect((await truncated.json()).data).toMatchObject({
      ok: false,
      code: 'ANCHOR_TAIL_TRUNCATED',
      current: { lastSeq: 2 },
    });
  });

  it('POST anchor/verify：非法锚点返回 422', async () => {
    const response = await verifyAnchor(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ formatVersion: 2 }),
      }),
      {} as never,
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
  });
});
