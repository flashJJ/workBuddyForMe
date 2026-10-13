import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations } from '../migrations/runner';
import { createEventUsageRepository } from './event-usage-repo';

const T0 = Date.UTC(2026, 9, 14, 1, 0, 0);
const DAY = '2026-10-14';

function setup() {
  const db = new Database(':memory:');
  applyMigrations(db);
  db.prepare(
    `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
  ).run();
  return { db, repo: createEventUsageRepository(db) };
}

describe('event-usage-repo', () => {
  it('append + 冷却闸门（只认 played）+ 每日计数', () => {
    const { repo } = setup();
    repo.append('a1', {
      eventId: 'ev.greeting.morning',
      dateKey: DAY,
      playedAtMs: T0,
      outcome: 'suppressed',
      reason: 'cooldown',
      priority: 1,
    });
    // suppressed 不影响冷却/计数
    expect(repo.lastPlayedAt('a1', 'ev.greeting.morning')).toBeNull();
    expect(repo.countPlayedToday('a1', 'ev.greeting.morning', DAY)).toBe(0);

    repo.append('a1', {
      eventId: 'ev.greeting.morning',
      dateKey: DAY,
      playedAtMs: T0 + 60_000,
      outcome: 'played',
      priority: 1,
    });
    expect(repo.lastPlayedAt('a1', 'ev.greeting.morning')).toBe(T0 + 60_000);
    expect(repo.countPlayedToday('a1', 'ev.greeting.morning', DAY)).toBe(1);

    repo.append('a1', {
      eventId: 'ev.greeting.morning',
      dateKey: DAY,
      playedAtMs: T0 + 120_000,
      outcome: 'skipped',
      reason: 'user_skip',
      priority: 1,
    });
    expect(repo.countPlayedToday('a1', 'ev.greeting.morning', DAY)).toBe(1);
  });

  it('非法 suppressed 原因码拒绝；跨日计数隔离', () => {
    const { repo } = setup();
    expect(() =>
      repo.append('a1', {
        eventId: 'ev.x',
        dateKey: DAY,
        playedAtMs: T0,
        outcome: 'suppressed',
        reason: 'bogus',
        priority: 1,
      }),
    ).toThrow();
    repo.append('a1', {
      eventId: 'ev.x',
      dateKey: DAY,
      playedAtMs: T0,
      outcome: 'played',
      priority: 1,
    });
    expect(repo.countPlayedToday('a1', 'ev.x', '2026-10-15')).toBe(0);
  });

  it('snapshot：每剧本聚合 lastPlayed + 今日计数（一次查询）', () => {
    const { repo } = setup();
    repo.append('a1', { eventId: 'ev.a', dateKey: DAY, playedAtMs: T0, outcome: 'played', priority: 1 });
    repo.append('a1', { eventId: 'ev.a', dateKey: DAY, playedAtMs: T0 + 1000, outcome: 'played', priority: 1 });
    repo.append('a1', { eventId: 'ev.b', dateKey: '2026-10-13', playedAtMs: T0 - 86400_000, outcome: 'played', priority: 1 });

    const snap = repo.snapshot('a1', DAY);
    const byId = new Map(snap.map((s) => [s.eventId, s]));
    expect(byId.get('ev.a')!.playedToday).toBe(2);
    expect(byId.get('ev.a')!.lastPlayedAt).toBe(T0 + 1000);
    expect(byId.get('ev.b')!.playedToday).toBe(0);
    expect(byId.get('ev.b')!.lastPlayedAt).toBe(T0 - 86400_000);
  });

  it('stats 四态统计 + purgeBefore 清理 + restoreOne 幂等', () => {
    const { repo } = setup();
    repo.append('a1', { eventId: 'ev.a', dateKey: DAY, playedAtMs: T0, outcome: 'played', priority: 1 });
    repo.append('a1', { eventId: 'ev.a', dateKey: DAY, playedAtMs: T0 + 1, outcome: 'skipped', reason: 'user_skip', priority: 1 });
    repo.append('a1', { eventId: 'ev.a', dateKey: DAY, playedAtMs: T0 + 2, outcome: 'suppressed', reason: 'quiet_hours', priority: 1 });

    const stats = repo.stats('a1', T0 - 1);
    expect(stats).toEqual({ played: 1, skipped: 1, interrupted: 0, suppressed: 1 });

    const all = repo.listAll();
    expect(all).toHaveLength(3);
    const deleted = repo.purgeBefore(T0 + 2);
    expect(deleted).toBe(2);
    expect(repo.listAll()).toHaveLength(1);

    const record = all[0]!;
    expect(repo.restoreOne('a1', { ...record, id: 'restore-1' })).toBe(true);
    expect(repo.restoreOne('a1', { ...record, id: 'restore-1' })).toBe(false);
  });
});
