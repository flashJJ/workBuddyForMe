import { describe, expect, it } from 'vitest';
import {
  createDatabase,
  createAssistantRepository,
  createScheduledTaskRepository,
  createEventUsageRepository,
  createEventTriggerRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { createWebCipher } from '../secrets/cipher';
import { ensureSeedData } from '../services/seed';
import { computeNextRunMs } from '../scheduler/next-run';
import { exportBackup } from './export';
import { restoreBackup, precheckBackup } from './restore';
import type { ServiceDeps } from '../services/deps';

/** v1.7 events 轨 roundtrip：自定义助手（含人格）+ 提醒 + 演出流水 */
describe('备份 events 轨（v1.7）', () => {
  function seedSource(): DatabaseInstance {
    const db = createDatabase(':memory:');
    ensureSeedData(db);
    const assistants = createAssistantRepository(db);
    const created = assistants.create({
      name: '测试自定义助手',
      emoji: '🦊',
      color: '#ff8800',
      systemPrompt: '自定义提示词',
      temperature: 0.7,
      topP: 1,
      maxTokens: null,
      modelId: null,
      knowledgeBaseIds: [],
      enabledTools: ['current_time'],
      retrieveAlways: true,
      memoryEnabled: true,
      expressionEnabled: true,
      personalityFrankness: 0.8,
      personalityTsundere: 0.2,
      personalityShy: 0.3,
      personalityTolerance: 0.6,
      isBuiltin: false,
      sortOrder: 9,
    });

    const schedules = createScheduledTaskRepository(db, { computeNextRunMs });
    schedules.create({
      assistantId: created.id,
      kind: 'daily',
      hour: 9,
      minute: 30,
      timezone: 'Asia/Shanghai',
      text: '该喝水了',
    });
    // 模拟备份时刻遗留的过期 next_run_at，恢复后应被统一重排到未来
    db.prepare(`UPDATE scheduled_tasks SET next_run_at = ?`).run('2000-01-01T00:00:00.000Z');

    const usage = createEventUsageRepository(db);
    usage.append(created.id, {
      eventId: 'ev.greeting.morning',
      dateKey: '2026-10-13',
      playedAtMs: Date.UTC(2026, 9, 13, 2, 0, 0),
      outcome: 'played',
      reason: null,
      priority: 2,
    });
    usage.append(created.id, {
      eventId: 'ev.greeting.morning',
      dateKey: '2026-10-13',
      playedAtMs: Date.UTC(2026, 9, 13, 3, 0, 0),
      outcome: 'suppressed',
      reason: 'cooldown',
      priority: 2,
    });

    // M5：一条自定义短语触发器（时间戳必须为合法 ISO，与仓储 nowIso() 落库口径一致）
    db.prepare(
      `INSERT INTO event_triggers(
         id, assistant_id, event_id, phrases_json, cooldown_ms, start_hour, end_hour,
         max_per_day, min_intimacy, enabled, created_at, updated_at)
       VALUES ('tg1', ?, 'ev.relation.praised', '["真棒","辛苦了"]', 600000, 8, 22, 3, 10, 1,
               '2026-10-13T08:00:00.000Z', '2026-10-13T08:00:00.000Z')`,
    ).run(created.id);
    return db;
  }

  it('导出→precheck→恢复：助手机行/提醒/流水齐全且提醒时刻重排', async () => {
    const srcDb = seedSource();
    const deps = { db: srcDb, cipher: createWebCipher() } as unknown as ServiceDeps;
    const { archive } = await exportBackup(deps, { tracks: ['events'] });

    const pre = await precheckBackup(archive);
    expect(pre.tracks.schedules).toBe(1);
    expect(pre.tracks.eventUsage).toBe(2);

    const dstDb = createDatabase(':memory:');
    const dstDeps = { db: dstDb, cipher: createWebCipher() } as unknown as ServiceDeps;
    const result = await restoreBackup(dstDeps, archive);
    // events 用户可见计数 = 提醒 1 + 触发器 1（助手/流水为附属数据不单列）
    expect(result.imported.events).toBe(2);
    expect(result.skipped.events).toBe(0);

    const assistants = createAssistantRepository(dstDb);
    const custom = assistants.list().find((a) => a.name === '测试自定义助手');
    expect(custom).toBeDefined();
    expect(custom!.isBuiltin).toBe(false);
    expect(custom!.personalityFrankness).toBeCloseTo(0.8);
    expect(custom!.personalityShy).toBeCloseTo(0.3);

    const schedules = createScheduledTaskRepository(dstDb, { computeNextRunMs }).listAll();
    expect(schedules).toHaveLength(1);
    expect(schedules[0]!.text).toBe('该喝水了');
    expect(Date.parse(schedules[0]!.nextRunAt)).toBeGreaterThan(Date.now());

    const usageRows = createEventUsageRepository(dstDb).listAll();
    expect(usageRows).toHaveLength(2);
    expect(usageRows.filter((r) => r.outcome === 'played')).toHaveLength(1);

    // M5：自定义触发器随轨恢复且字段不丢失
    const triggers = createEventTriggerRepository(dstDb).list();
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.id).toBe('tg1');
    expect(triggers[0]!.eventId).toBe('ev.relation.praised');
    expect(triggers[0]!.phrases).toEqual(['真棒', '辛苦了']);
    expect(triggers[0]!.cooldownMs).toBe(600000);
    expect(triggers[0]!.minIntimacy).toBe(10);
    expect(triggers[0]!.enabled).toBe(true);

    srcDb.close();
    dstDb.close();
  });

  it('幂等恢复：第二次恢复全部忽略，不覆盖本机', async () => {
    const srcDb = seedSource();
    const deps = { db: srcDb, cipher: createWebCipher() } as unknown as ServiceDeps;
    const { archive } = await exportBackup(deps, { tracks: ['events'] });

    const dstDb = createDatabase(':memory:');
    const dstDeps = { db: dstDb, cipher: createWebCipher() } as unknown as ServiceDeps;
    await restoreBackup(dstDeps, archive);
    const second = await restoreBackup(dstDeps, archive);
    expect(second.imported.events).toBe(0);
    // 幂等：提醒 1 + 触发器 1 均已存在
    expect(second.skipped.events).toBe(2);

    srcDb.close();
    dstDb.close();
  });
});
