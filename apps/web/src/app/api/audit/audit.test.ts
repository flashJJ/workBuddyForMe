import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import {
  __buildContainerForTest,
  __setContainerForTest,
  type ServiceContainer,
} from '@/lib/server/container';
import { GET as listEvents } from './events/route';
import { POST as verifyAudit } from './verify/route';
import { GET as exportAudit } from './export/route';

describe('审计账本 API（v2.13 M3）', () => {
  let db: DatabaseInstance;
  let services: ServiceContainer;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-audit-api-')));
    db = createDatabase(':memory:');
    services = __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('GET /api/audit/events 过滤与游标；非法 kind 返回 422', async () => {
    services.audit.append({ kind: 'run_started', actor: 'agent', runId: 'r1' });
    services.audit.append({ kind: 'policy_denied', actor: 'agent', runId: 'r2', tool: 'mouse_click' });
    services.audit.append({ kind: 'run_finished', actor: 'agent', runId: 'r1' });

    const res = await listEvents(new Request('http://127.0.0.1/api/audit/events?runId=r1'));
    expect(res.status).toBe(200);
    const data = (await res.json()).data as {
      events: Array<{ kind: string }>;
      nextCursor: number | null;
    };
    expect(data.events.map((event) => event.kind)).toEqual(['run_finished', 'run_started']);

    const bad = await listEvents(new Request('http://127.0.0.1/api/audit/events?kind=nope'));
    expect(bad.status).toBe(422);
  });

  it('POST /api/audit/verify 篡改后返回首个断链 seq', async () => {
    services.audit.append({ kind: 'run_started', actor: 'agent', runId: 'r1' });
    services.audit.append({ kind: 'run_finished', actor: 'agent', runId: 'r1' });

    const okRes = await verifyAudit(new Request('http://127.0.0.1/api/audit/verify', { method: 'POST' }));
    const okBody = (await okRes.json()).data as { ok: boolean; checked: number };
    expect(okBody.ok).toBe(true);
    expect(okBody.checked).toBe(2);

    db.prepare("UPDATE audit_events SET outcome = 'tampered' WHERE seq = 1").run();
    const brokenRes = await verifyAudit(
      new Request('http://127.0.0.1/api/audit/verify', { method: 'POST' }),
    );
    const brokenBody = (await brokenRes.json()).data as {
      ok: boolean;
      firstBrokenSeq: number;
    };
    expect(brokenBody.ok).toBe(false);
    expect(brokenBody.firstBrokenSeq).toBe(1);
  });

  it('策略保存写 policy_updated（带新旧哈希）', async () => {
    const current = services.settings.get().agentPolicy!;
    services.settings.update({
      agentPolicy: { ...current, defaultMode: 'plan_only' },
    });
    const res = await listEvents(
      new Request('http://127.0.0.1/api/audit/events?kind=policy_updated'),
    );
    const data = (await res.json()).data as {
      events: Array<{ kind: string; policyHash: string | null; outcome: string | null }>;
    };
    expect(data.events).toHaveLength(1);
    expect(data.events[0]!.kind).toBe('policy_updated');
    expect(data.events[0]!.policyHash).toHaveLength(64);
    expect(data.events[0]!.outcome).toContain('->');
  });

  it('GET /api/audit/export 流式导出 JSONL（升序）', async () => {
    services.audit.append({ kind: 'run_started', actor: 'agent', runId: 'r1' });
    services.audit.append({ kind: 'run_finished', actor: 'agent', runId: 'r1' });

    const res = await exportAudit(new Request('http://127.0.0.1/api/audit/export?format=jsonl'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const text = await res.text();
    const lines = text.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect((JSON.parse(lines[0]!) as { seq: number }).seq).toBe(1);

    const bad = await exportAudit(new Request('http://127.0.0.1/api/audit/export'));
    expect(bad.status).toBe(422);
  });
});
