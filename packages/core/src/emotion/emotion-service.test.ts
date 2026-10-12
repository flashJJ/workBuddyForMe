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

  it('M4：record 同时追加事件流水，viewWithEvents 倒序返回', () => {
    const { deps, close } = setup();
    const now = new Date(T0).toISOString();
    // 事件外键引用真实消息（消息删除时 message_id 置空）
    deps.db
      .prepare(
        `INSERT INTO conversations(id,assistant_id,created_at,updated_at) VALUES('c1','a1',?,?)`,
      )
      .run(now, now);
    deps.db
      .prepare(
        `INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES('m-1','c1','assistant','hi',?)`,
      )
      .run(now);
    const service = createEmotionService(deps);
    service.record(
      'a1',
      { type: 'praise', source: 'model', emotion: 'joy', intensity: 0.7, messageId: 'm-1' },
      T0,
    );
    service.record('a1', { type: 'chat', source: 'rule' }, T0 + 1000);

    const detail = service.viewWithEvents('a1', 10, T0 + 1000);
    expect(detail.events).toHaveLength(2);
    expect(detail.events[0]).toMatchObject({
      type: 'chat',
      source: 'rule',
      emotion: null,
      messageId: null,
    });
    expect(detail.events[1]).toMatchObject({
      type: 'praise',
      source: 'model',
      emotion: 'joy',
      intensity: 0.7,
      messageId: 'm-1',
    });
    // 流水（倒序）与快照 recentEvents（正序）同一事件 id 一致
    expect(detail.state.recentEvents[0]!.id).toBe(detail.events[1]!.id); // praise
    expect(detail.state.recentEvents[1]!.id).toBe(detail.events[0]!.id); // chat
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

  it('setNeed 持久化需求；reset 删除状态行与事件流水并回默认', () => {
    const { deps, close } = setup();
    const service = createEmotionService(deps);
    const withNeed = service.setNeed('a1', 'comfort', T0);
    expect(withNeed.currentNeed).toBe('comfort');
    expect(service.view('a1', T0).currentNeed).toBe('comfort');

    service.record('a1', { type: 'praise', source: 'model' }, T0 + 500);
    expect(service.viewWithEvents('a1').events).toHaveLength(1);

    const reset = service.reset('a1', T0 + 1000);
    expect(reset.mood.happiness).toBe(10);
    expect(reset.currentNeed).toBe('none');
    expect(service.view('a1', T0 + 1000).relation.intimacy).toBe(20);
    expect(service.viewWithEvents('a1').events).toHaveLength(0);
    const stateCount = deps.db
      .prepare(`SELECT COUNT(*) AS n FROM assistant_emotion_states`)
      .get() as { n: number };
    const eventCount = deps.db
      .prepare(`SELECT COUNT(*) AS n FROM emotion_events`)
      .get() as { n: number };
    expect(stateCount.n).toBe(0);
    expect(eventCount.n).toBe(0);
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
