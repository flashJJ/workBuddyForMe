import { describe, expect, it } from 'vitest';
import { createDatabase, createSettingsRepository } from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { createMilestoneService } from './milestone-service';

const DAY = 86_400_000;

function setup(): { deps: ServiceDeps; close: () => void } {
  const db = createDatabase();
  db.prepare(
    `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
  ).run();
  db.prepare(
    `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a2','助手二','t','t')`,
  ).run();
  return { deps: { db } as ServiceDeps, close: () => db.close() };
}

function addPositiveEvent(deps: ServiceDeps, atIso: string, id = 'e1'): void {
  deps.db
    .prepare(
      `INSERT INTO emotion_events(id,assistant_id,type,source,emotion,intensity,message_id,created_at)
       VALUES(?, 'a1', 'chat', 'model', NULL, NULL, NULL, ?)`,
    )
    .run(id, atIso);
}

function setRelationshipEnabled(deps: ServiceDeps, value: boolean): void {
  createSettingsRepository(deps.db).setJson('app-settings', { relationshipEnabled: value });
}

describe('v2.0 M2 milestone-service', () => {
  it('首次正向互动当天：懒评估即达成 day_1，幂等不重复', () => {
    const { deps, close } = setup();
    const now = Date.UTC(2026, 9, 15, 8, 0, 0);
    addPositiveEvent(deps, new Date(now).toISOString());
    const service = createMilestoneService(deps);

    const first = service.evaluateAssistant('a1', now);
    expect(first.map((m) => m.milestoneKey)).toEqual(['day_1']);
    expect(first[0]!.payload).toMatchObject({ sceneId: 'ev.milestone.day1' });

    const second = service.evaluateAssistant('a1', now + 1000);
    expect(second).toEqual([]);
    expect(service.list('a1')).toHaveLength(1);
    close();
  });

  it('30 天后懒评估补齐 day_1+day_30；协作 10 次达成 collab_10', () => {
    const { deps, close } = setup();
    const t0 = Date.UTC(2026, 9, 15, 8, 0, 0);
    addPositiveEvent(deps, new Date(t0).toISOString());
    for (let i = 0; i < 10; i += 1) {
      deps.db
        .prepare(
          `INSERT INTO agent_runs(id,assistant_id,goal,status,round_no,max_rounds,max_steps,
            max_total_tokens,created_at,updated_at)
           VALUES(?, 'a1', 'g', 'done', 0, 1, 1, 1, ?, ?)`,
        )
        .run(`r${i}`, new Date(t0).toISOString(), new Date(t0).toISOString());
    }
    const service = createMilestoneService(deps);
    const due = service.evaluateAssistant('a1', t0 + 30 * DAY);
    expect(due.map((m) => m.milestoneKey).sort()).toEqual(['collab_10', 'day_1', 'day_30']);
    close();
  });

  it('relationshipEnabled=false：懒评估与每日扫描全部冻结', () => {
    const { deps, close } = setup();
    setRelationshipEnabled(deps, false);
    addPositiveEvent(deps, new Date(Date.UTC(2026, 9, 15, 8, 0, 0)).toISOString());
    const service = createMilestoneService(deps);
    expect(service.evaluateAssistant('a1')).toEqual([]);
    expect(service.evaluateAll()).toEqual([]);
    expect(service.list('a1')).toHaveLength(0);
    close();
  });

  it('每日扫描覆盖全部助手（含尚无记录的），进程内同日只扫一次', () => {
    const { deps, close } = setup();
    const now = Date.UTC(2026, 9, 15, 8, 0, 0);
    addPositiveEvent(deps, new Date(now).toISOString());
    deps.db
      .prepare(
        `INSERT INTO emotion_events(id,assistant_id,type,source,emotion,intensity,message_id,created_at)
         VALUES('e2', 'a2', 'praise', 'model', NULL, NULL, NULL, ?)`,
      )
      .run(new Date(now).toISOString());
    const service = createMilestoneService(deps);
    const first = service.evaluateAll(now);
    expect(first).toHaveLength(2);
    // 插入新助手的新正向事件，同日二次扫描被守卫跳过（懒评估/次日扫描兜底）
    deps.db
      .prepare(
        `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a3','三','t','t')`,
      )
      .run();
    deps.db
      .prepare(
        `INSERT INTO emotion_events(id,assistant_id,type,source,emotion,intensity,message_id,created_at)
         VALUES('e3', 'a3', 'comfort', 'event', NULL, NULL, NULL, ?)`,
      )
      .run(new Date(now).toISOString());
    expect(service.evaluateAll(now + 1000)).toEqual([]);
    // 懒评估不受日守卫影响，新助手可实时达成
    expect(service.evaluateAssistant('a3', now + 1000).map((m) => m.milestoneKey)).toEqual([
      'day_1',
    ]);
    close();
  });

  it('重置情绪（emotion service reset）时里程碑一并清空', async () => {
    const { createEmotionService } = await import('./emotion-service');
    const { deps, close } = setup();
    const now = Date.UTC(2026, 9, 15, 8, 0, 0);
    addPositiveEvent(deps, new Date(now).toISOString());
    createMilestoneService(deps).evaluateAssistant('a1', now);
    expect(createMilestoneService(deps).list('a1')).toHaveLength(1);

    createEmotionService(deps).reset('a1', now);
    expect(createMilestoneService(deps).list('a1')).toHaveLength(0);
    close();
  });
});
