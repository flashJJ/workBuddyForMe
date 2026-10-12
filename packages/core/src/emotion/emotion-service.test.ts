import { describe, expect, it } from 'vitest';
import { createDatabase } from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { createEmotionService } from './emotion-service';

const T0 = Date.UTC(2026, 9, 12, 8, 0, 0);
const MINUTE = 60_000;

function setup(): { deps: ServiceDeps; close: () => void } {
  const db = createDatabase();
  db.prepare(
    `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
  ).run();
  return { deps: { db } as ServiceDeps, close: () => db.close() };
}

describe('createEmotionService（v1.6）', () => {
  it('view 无行返回默认状态且不写库', () => {
    const { deps, close } = setup();
    const service = createEmotionService(deps);
    const state = service.view('a1', T0);
    expect(state.mood.happiness).toBe(10);
    expect(state.relation).toEqual({ intimacy: 20, trust: 30 });
    const row = deps.db
      .prepare(`SELECT COUNT(*) AS n FROM assistant_emotion_states`)
      .get() as { n: number };
    expect(row.n).toBe(0);
    close();
  });

  it('record 落库，再次 view 读到同一状态', () => {
    const { deps, close } = setup();
    const service = createEmotionService(deps);
    const next = service.record(
      'a1',
      { type: 'praise', source: 'model', description: '被夸了' },
      T0,
    );
    expect(next.mood.happiness).toBe(18);
    expect(next.recentEvents).toHaveLength(1);

    const reloaded = service.view('a1', T0);
    expect(reloaded.mood.happiness).toBe(18);
    expect(reloaded.relation.intimacy).toBe(22);
    close();
  });

  it('离线期间情绪在下次互动时结算衰减，关系保留', () => {
    const { deps, close } = setup();
    const service = createEmotionService(deps);
    service.record('a1', { type: 'praise', source: 'model' }, T0); // happiness 18
    // 60 分钟后又被夸：先衰减 18*0.98，再 +8
    const later = service.record('a1', { type: 'praise', source: 'model' }, T0 + MINUTE);
    expect(later.mood.happiness).toBeCloseTo(18 * 0.98 + 8, 2);
    // 亲密度两次 praise = 24，不衰减
    expect(later.relation.intimacy).toBe(24);
    close();
  });

  it('view 只读衰减不落库（读不改变持久化时刻）', () => {
    const { deps, close } = setup();
    const service = createEmotionService(deps);
    service.record('a1', { type: 'praise', source: 'model' }, T0);
    service.view('a1', T0 + 10 * MINUTE);
    // 立刻再 view：若上次衰减被写回，happiness 会按更短时长计算；
    // 从 T0 起算两次结果应一致
    const a = service.view('a1', T0 + 10 * MINUTE).mood.happiness;
    const b = service.view('a1', T0 + 10 * MINUTE).mood.happiness;
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeCloseTo(18 * 0.98 ** 10, 2);
    close();
  });

  it('setNeed 持久化需求；reset 删除行并回默认', () => {
    const { deps, close } = setup();
    const service = createEmotionService(deps);
    const withNeed = service.setNeed('a1', 'comfort', T0);
    expect(withNeed.currentNeed).toBe('comfort');
    expect(service.view('a1', T0).currentNeed).toBe('comfort');

    const reset = service.reset('a1', T0 + 1000);
    expect(reset.mood.happiness).toBe(10);
    expect(reset.currentNeed).toBe('none');
    expect(service.view('a1', T0 + 1000).relation.intimacy).toBe(20);
    const count = deps.db
      .prepare(`SELECT COUNT(*) AS n FROM assistant_emotion_states`)
      .get() as { n: number };
    expect(count.n).toBe(0);
    close();
  });

  it('连续 chat 小步积累亲密度（慢变量）', () => {
    const { deps, close } = setup();
    const service = createEmotionService(deps);
    let intimacy = 20;
    for (let i = 0; i < 10; i++) {
      const state = service.record('a1', { type: 'chat', source: 'model' }, T0 + i);
      intimacy = state.relation.intimacy;
    }
    expect(intimacy).toBeCloseTo(20 + 0.25 * 10, 2);
    close();
  });
});
