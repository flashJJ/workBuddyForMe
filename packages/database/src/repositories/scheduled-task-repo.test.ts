import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import { applyMigrations } from '../migrations/runner';
import { createScheduledTaskRepository } from './scheduled-task-repo';
import type { ScheduledTaskCreateInput } from '@wbfm/shared/schemas';

const NOW = Date.UTC(2026, 9, 14, 1, 0, 0); // 2026-10-14 09:00 上海

/** 确定性 computeNextRunMs：fromMs + 1h（测仓储流转而非时区算法；hour=-1 模拟过期） */
const computeNextRunMs = vi.fn((spec: { hour: number }, fromMs: number) => {
  if (spec.hour < 0) return null;
  return fromMs + 3600_000;
});

function setup() {
  const db = new Database(':memory:');
  applyMigrations(db);
  db.prepare(
    `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
  ).run();
  const repo = createScheduledTaskRepository(db, { computeNextRunMs, now: () => NOW });
  return { db, repo };
}

describe('scheduled-task-repo', () => {
  it('create：daily/weekly 落 NULL 专属列，listDue 按 UTC 比较', () => {
    const { repo } = setup();
    const daily = repo.create({
      assistantId: 'a1',
      kind: 'daily',
      hour: 9,
      minute: 30,
      timezone: 'Asia/Shanghai',
      text: '喝水',
    } satisfies ScheduledTaskCreateInput);
    expect(daily.enabled).toBe(true);
    expect(daily.atDate).toBeNull();
    expect(daily.nextRunAt).toBe(new Date(NOW + 3600_000).toISOString());

    const weekly = repo.create({
      assistantId: 'a1',
      kind: 'weekly',
      hour: 20,
      minute: 0,
      weekday: 5,
      timezone: 'Asia/Shanghai',
      text: '周报',
    });
    expect(weekly.weekday).toBe(5);

    expect(repo.listDue(NOW)).toHaveLength(0);
    expect(repo.listDue(NOW + 3600_001)).toHaveLength(2);
  });

  it('once：过期时间抛 SCHEDULE_EXPIRED（UI 据此拒绝）', () => {
    const { repo } = setup();
    computeNextRunMs.mockReturnValueOnce(null);
    expect(() =>
      repo.create({
        assistantId: 'a1',
        kind: 'once',
        hour: 9,
        minute: 0,
        atDate: '2026-10-01',
        timezone: 'Asia/Shanghai',
        text: '过期提醒',
      }),
    ).toThrow('提醒时间已过期');
  });

  it('markFired：once 停用；daily 重算下一时刻', () => {
    const { repo } = setup();
    const once = repo.create({
      assistantId: 'a1',
      kind: 'once',
      hour: 9,
      minute: 0,
      atDate: '2026-10-20',
      timezone: 'Asia/Shanghai',
      text: '一次性',
    });
    const firedOnce = repo.markFired(once.id, NOW + 1000)!;
    expect(firedOnce.enabled).toBe(false);
    expect(firedOnce.lastFiredAt).toBe(new Date(NOW + 1000).toISOString());
    expect(repo.listDue(NOW + 10_000_000)).toHaveLength(0);

    const daily = repo.create({
      assistantId: 'a1',
      kind: 'daily',
      hour: 8,
      minute: 0,
      timezone: 'Asia/Shanghai',
      text: '每天',
    });
    const firedDaily = repo.markFired(daily.id, NOW + 2000)!;
    expect(firedDaily.enabled).toBe(true);
    expect(firedDaily.nextRunAt).toBe(new Date(NOW + 2000 + 3600_000).toISOString());
  });

  it('update：改时间重算 next_run_at；停用不删行', () => {
    const { repo } = setup();
    const task = repo.create({
      assistantId: 'a1',
      kind: 'daily',
      hour: 9,
      minute: 0,
      timezone: 'Asia/Shanghai',
      text: 'x',
    });
    const updated = repo.update(task.id, { hour: 22 })!;
    expect(updated.hour).toBe(22);
    expect(computeNextRunMs).toHaveBeenCalled();

    const disabled = repo.setEnabled(task.id, false)!;
    expect(disabled.enabled).toBe(false);
    expect(repo.findById(task.id)).not.toBeNull();
  });

  it('restoreOne 幂等 + recomputeEnabled 重排启用行', () => {
    const { repo } = setup();
    const created = repo.create({
      assistantId: 'a1',
      kind: 'daily',
      hour: 9,
      minute: 0,
      timezone: 'Asia/Shanghai',
      text: 'x',
    });
    expect(repo.restoreOne(created)).toBe(false); // 已存在忽略
    const foreign = { ...created, id: 's-foreign', assistantId: 'a1', nextRunAt: '2000-01-01T00:00:00.000Z' };
    expect(repo.restoreOne(foreign)).toBe(true);
    const touched = repo.recomputeEnabled(NOW);
    expect(touched).toBe(2);
    expect(repo.findById('s-foreign')!.nextRunAt).not.toBe('2000-01-01T00:00:00.000Z');
  });
});
