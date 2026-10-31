import { describe, expect, it } from 'vitest';
import { createDatabase } from '@wbfm/database';
import { createAuditService } from './audit';

function setup() {
  const db = createDatabase(':memory:');
  return { db, audit: createAuditService(db) };
}

describe('审计账本哈希链（v2.13 M3）', () => {
  it('追加按 seq 递增，prev_hash 串起上一条；校验通过并落 audit_verified', () => {
    const { db, audit } = setup();
    const first = audit.append({ kind: 'run_started', actor: 'agent', runId: 'r1' });
    expect(first.seq).toBe(1);
    expect(first.prevHash).toBe('GENESIS');
    expect(first.hash).toHaveLength(64);

    const second = audit.append({
      kind: 'policy_denied',
      actor: 'agent',
      runId: 'r1',
      tool: 'keyboard_type',
      decision: 'deny',
      reasonCode: 'POLICY_DENY',
    });
    expect(second.seq).toBe(2);
    expect(second.prevHash).toBe(first.hash);

    const result = audit.verify();
    expect(result).toEqual({ ok: true, checked: 2, firstBrokenSeq: null });
    // 校验自身也追加一条审计事件
    expect(audit.count()).toBe(3);
    expect(audit.list({ limit: 5 }).events[0]!.kind).toBe('audit_verified');
    db.close();
  });

  it('直接改库后校验失败，返回首个断链 seq', () => {
    const { db, audit } = setup();
    audit.append({ kind: 'run_started', actor: 'agent', runId: 'r1' });
    audit.append({ kind: 'run_finished', actor: 'agent', runId: 'r1', outcome: 'completed' });
    db.prepare("UPDATE audit_events SET outcome = 'tampered' WHERE seq = 2").run();

    const result = audit.verify();
    expect(result.ok).toBe(false);
    expect(result.firstBrokenSeq).toBe(2);
    expect(result.checked).toBe(1);
    db.close();
  });

  it('seq 不连续视为断链', () => {
    const { db, audit } = setup();
    audit.append({ kind: 'run_started', actor: 'agent', runId: 'r1' });
    audit.append({ kind: 'run_finished', actor: 'agent', runId: 'r1' });
    audit.append({ kind: 'policy_denied', actor: 'agent', runId: 'r1' });
    db.prepare('DELETE FROM audit_events WHERE seq = 2').run();

    const result = audit.verify();
    expect(result).toMatchObject({ ok: false, firstBrokenSeq: 2 });
    expect(result.checked).toBe(1);
    db.close();
  });

  it('按 kind / runId 过滤、cursor 倒序翻页、JSONL 导出升序', () => {
    const { db, audit } = setup();
    for (let i = 1; i <= 5; i += 1) {
      audit.append({
        kind: i % 2 === 0 ? 'approval_denied' : 'run_started',
        actor: 'agent',
        runId: i <= 3 ? 'r1' : 'r2',
      });
    }
    const denied = audit.list({ kind: 'approval_denied', limit: 10 });
    expect(denied.events.map((event) => event.seq)).toEqual([4, 2]);
    expect(denied.nextCursor).toBeNull();

    const page1 = audit.list({ limit: 2 });
    expect(page1.events.map((event) => event.seq)).toEqual([5, 4]);
    expect(page1.nextCursor).toBe(4);
    const page2 = audit.list({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.events.map((event) => event.seq)).toEqual([3, 2]);

    const lines = [...audit.iterateJsonl()];
    expect(lines).toHaveLength(5);
    const first = JSON.parse(lines[0]!) as { seq: number };
    expect(first.seq).toBe(1);
    db.close();
  });
});
