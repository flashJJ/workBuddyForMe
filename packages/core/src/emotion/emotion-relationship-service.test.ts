import { describe, expect, it } from 'vitest';
import {
  createDatabase,
  createEmotionStateRepository,
  createSettingsRepository,
} from '@wbfm/database';
import {
  createDefaultEmotionState,
  localDayKey,
  type EmotionState,
} from '@wbfm/shared/schemas';
import type { ServiceDeps } from '../services/deps';
import { createEmotionService } from './emotion-service';
import { defaultRelationshipBlock } from './relationship-kernel';

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

function setRelationshipEnabled(deps: ServiceDeps, value: boolean): void {
  createSettingsRepository(deps.db).setJson('app-settings', {
    relationshipEnabled: value,
  });
}

describe('v2.0 emotion-service 关系接线', () => {
  it('升级：抬地板/最高纪录/日增益/lastPositiveDay，并写 source=system 的 level_up 流水', () => {
    const { deps, close } = setup();
    const service = createEmotionService(deps);
    const now = Date.UTC(2026, 9, 15, 8, 0, 0);

    const next = service.record(
      'a1',
      { type: 'praise', source: 'model' },
      now,
    );
    // 初始复合分 24，praise +2/+1 → 25.6，升入认识（1）
    expect(next.relationship.levelFloor).toBe(1);
    expect(next.relationship.highestLevelEver).toBe(1);
    expect(next.relationship.dailyGain).toMatchObject({
      dayKey: localDayKey(now),
      intimacy: 2,
      trust: 1,
    });
    expect(next.relationship.lastPositiveDay).toBe(localDayKey(now));

    const events = service.viewWithEvents('a1', 10, now).events;
    const levelUp = events.filter((e) => e.type === 'level_up');
    expect(levelUp).toHaveLength(1);
    expect(levelUp[0]).toMatchObject({
      source: 'system',
      emotion: null,
      messageId: null,
      intensity: 1,
    });
    close();
  });

  it('日上限：同日多次 praise 后亲密 +6/信任 +3 截断，但事件流水一条不少', () => {
    const { deps, close } = setup();
    const service = createEmotionService(deps);
    const now = Date.UTC(2026, 9, 15, 8, 0, 0);
    for (let i = 0; i < 6; i += 1) {
      service.record('a1', { type: 'praise', source: 'model' }, now + i * 1000);
    }
    const state = service.view('a1', now + 60_000);
    expect(state.relation).toEqual({ intimacy: 26, trust: 33 });
    expect(state.relationship.dailyGain).toMatchObject({ intimacy: 6, trust: 3 });
    // 6 条 soul 流水 + 1 条 level_up（仅第一次跨阈）
    const events = service.viewWithEvents('a1', 20, now + 60_000).events;
    expect(events.filter((e) => e.type === 'praise')).toHaveLength(6);
    expect(events.filter((e) => e.type === 'level_up')).toHaveLength(1);
    close();
  });

  it('relationshipEnabled=false：关系块冻结、无等级流水，intimacy/trust 仍按 v1.6 增长', () => {
    const { deps, close } = setup();
    setRelationshipEnabled(deps, false);
    const service = createEmotionService(deps);
    const now = Date.UTC(2026, 9, 15, 8, 0, 0);
    const state = service.record('a1', { type: 'praise', source: 'model' }, now);
    expect(state.relation.intimacy).toBe(22);
    expect(state.relationship).toEqual(defaultRelationshipBlock());
    const events = service.viewWithEvents('a1', 10, now).events;
    expect(events.some((e) => e.type === 'level_up')).toBe(false);
    close();
  });

  it('每日检查点：31 天零正向降 1 档并写 level_down；当天重跑幂等；开关关闭空转', () => {
    const { deps, close } = setup();
    setRelationshipEnabled(deps, false);
    const frozenAt = Date.now();
    const repo = createEmotionStateRepository(deps.db);
    const stale: EmotionState = createDefaultEmotionState(frozenAt);
    stale.relationship = {
      ...defaultRelationshipBlock(),
      levelFloor: 3,
      highestLevelEver: 3,
      lastPositiveDay: localDayKey(Date.now() - 31 * DAY),
    };
    repo.upsert('a1', stale);
    const offService = createEmotionService(deps);
    offService.runRelationshipCheckpoint(Date.now());
    expect(repo.get('a1')!.state.relationship.levelFloor).toBe(3);

    // 打开开关后新服务实例（模拟第二天重启后重新评估）
    setRelationshipEnabled(deps, true);
    const service = createEmotionService(deps);
    service.runRelationshipCheckpoint(Date.now());
    const after = repo.get('a1')!.state.relationship;
    expect(after.levelFloor).toBe(2);
    expect(after.lastFloorDownAt).toBe(localDayKey(Date.now()));
    expect(after.highestLevelEver).toBe(3);
    // 同日心跳再跑：不连降
    service.runRelationshipCheckpoint(Date.now() + 10_000);
    expect(repo.get('a1')!.state.relationship.levelFloor).toBe(2);

    // level_down 落 system 流水，intensity=新等级
    const rows = deps.db
      .prepare(`SELECT type, source, intensity FROM emotion_events WHERE assistant_id='a1'`)
      .all() as Array<{ type: string; source: string; intensity: number }>;
    expect(rows).toEqual([{ type: 'level_down', source: 'system', intensity: 2 }]);
    close();
  });

  it('检查点按本地日去重：同一进程当天只全表扫描一次（第二助手同日不重复评估）', () => {
    const { deps, close } = setup();
    const repo = createEmotionStateRepository(deps.db);
    const stale: EmotionState = createDefaultEmotionState(Date.now());
    stale.relationship = {
      ...defaultRelationshipBlock(),
      levelFloor: 2,
      highestLevelEver: 2,
      lastPositiveDay: localDayKey(Date.now() - 31 * DAY),
    };
    repo.upsert('a2', stale);
    const service = createEmotionService(deps);
    service.runRelationshipCheckpoint(Date.now());
    expect(repo.get('a2')!.state.relationship.levelFloor).toBe(1);
    // 当天第二次心跳：内存日守卫直接返回（若重复评估，因 lastFloorDownAt=今天仍幂等，
    // 这里以「不新增流水」验证外部行为）
    service.runRelationshipCheckpoint(Date.now() + 1000);
    const count = deps.db
      .prepare(`SELECT COUNT(*) AS n FROM emotion_events WHERE assistant_id='a2'`)
      .get() as { n: number };
    expect(count.n).toBe(1);
    close();
  });
});
