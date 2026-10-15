import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_CONTEXT_TRIGGERS,
  CONTEXT_SCENE_IDS,
  LATE_NIGHT_END_HOUR,
  LATE_NIGHT_START_HOUR,
  LONG_NO_CHAT_TRIGGER_MS,
  WORK_STREAK_IDLE_GAP_MS,
  WORK_STREAK_TRIGGER_MS,
  createInitialContextState,
  isLateNightHour,
  reduceContextTick,
  timeOfDaySlot,
  type ContextTickInput,
} from './index';

const MIN = 60_000;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 20, 12, 0, 0);

function tick(partial: Partial<ContextTickInput> & { now: number }): ContextTickInput {
  return {
    hour: new Date(partial.now).getHours(),
    nightKey: `night-${new Date(partial.now).toISOString().slice(0, 10)}`,
    activeNow: true,
    lastChatAt: null,
    ...partial,
  };
}

describe('上下文触发器注册表（封闭枚举）', () => {
  it('3 个内置上下文触发器，eventId 全部能在封闭 id 表中对上', () => {
    expect(BUILT_IN_CONTEXT_TRIGGERS).toHaveLength(3);
    expect(BUILT_IN_CONTEXT_TRIGGERS.map((t) => t.eventId).sort()).toEqual(
      [
        CONTEXT_SCENE_IDS.lateNight,
        CONTEXT_SCENE_IDS.workStreak,
        CONTEXT_SCENE_IDS.longNoChat,
      ].sort(),
    );
    for (const spec of BUILT_IN_CONTEXT_TRIGGERS) {
      expect(spec.eventId).toMatch(/^ev\.context\.[a-z]+$/);
    }
    expect(BUILT_IN_CONTEXT_TRIGGERS.find((t) => t.kind === 'timeOfDay')?.slot).toBe('lateNight');
  });

  it('时段分类：morning/noon/evening/lateNight 边界精确', () => {
    expect(timeOfDaySlot(5)).toBe('morning');
    expect(timeOfDaySlot(10)).toBe('morning');
    expect(timeOfDaySlot(11)).toBe('noon');
    expect(timeOfDaySlot(13)).toBe('noon');
    expect(timeOfDaySlot(14)).toBe('evening');
    expect(timeOfDaySlot(22)).toBe('evening');
    expect(timeOfDaySlot(LATE_NIGHT_START_HOUR)).toBe('lateNight');
    expect(timeOfDaySlot(0)).toBe('lateNight');
    expect(timeOfDaySlot(LATE_NIGHT_END_HOUR - 1)).toBe('lateNight');
    expect(isLateNightHour(23)).toBe(true);
    expect(isLateNightHour(4)).toBe(true);
    expect(isLateNightHour(5)).toBe(false);
  });
});

describe('reduceContextTick：连续工作时长', () => {
  it('满阈值跨一次 tick 只触发一次，断口后重新计时可再触发', () => {
    let s = createInitialContextState();
    // 工作段从首次观测到活跃起算（挂载即起算，保守口径）
    s = reduceContextTick(s, tick({ now: T0, activeNow: true })).state;
    // 89 分钟：不触发
    let r = reduceContextTick(s, tick({ now: T0 + 89 * MIN, activeNow: true }));
    expect(r.fires).toEqual([]);
    s = r.state;
    // 90 分钟：触发
    r = reduceContextTick(s, tick({ now: T0 + WORK_STREAK_TRIGGER_MS, activeNow: true }));
    expect(r.fires.map((f) => f.eventId)).toEqual([CONTEXT_SCENE_IDS.workStreak]);
    s = r.state;
    // 持续活跃不再重复
    r = reduceContextTick(s, tick({ now: T0 + WORK_STREAK_TRIGGER_MS + MIN, activeNow: true }));
    expect(r.fires).toEqual([]);
    s = r.state;
    // 空闲超过断口：本段清零
    r = reduceContextTick(s, tick({ now: T0 + 3 * HOUR, activeNow: false }));
    expect(r.state.workStreak).toBeNull();
    s = r.state;
    // 新一段满 90min：再次触发（导演层另有每日 2 次/2h 冷却兜底）
    const t1 = T0 + 3 * HOUR + WORK_STREAK_IDLE_GAP_MS;
    s = reduceContextTick(s, tick({ now: t1, activeNow: true })).state;
    r = reduceContextTick(s, tick({ now: t1 + WORK_STREAK_TRIGGER_MS, activeNow: true }));
    expect(r.fires.map((f) => f.eventId)).toEqual([CONTEXT_SCENE_IDS.workStreak]);
  });

  it('不活跃期间绝不触发', () => {
    const r = reduceContextTick(
      createInitialContextState(),
      tick({ now: T0 + WORK_STREAK_TRIGGER_MS, activeNow: false }),
    );
    expect(r.fires).toEqual([]);
    expect(r.state.workStreak).toBeNull();
  });
});

describe('reduceContextTick：深夜关怀', () => {
  it('深夜活跃触发，同一夜晚键（23 点与次日凌晨）只演一次', () => {
    const nightFires = (fires: ReturnType<typeof reduceContextTick>['fires']) =>
      fires.filter((f) => f.kind === 'timeOfDay').map((f) => f.eventId);
    const nightKey = 'night-2026-10-20';
    // 间隔 40 分钟（<90min 工时阈值），隔离工时触发器
    let r = reduceContextTick(
      createInitialContextState(),
      tick({ now: T0, hour: 23, nightKey, activeNow: true }),
    );
    expect(nightFires(r.fires)).toEqual([CONTEXT_SCENE_IDS.lateNight]);
    r = reduceContextTick(
      r.state,
      tick({ now: T0 + 40 * MIN, hour: 23, nightKey, activeNow: true }),
    );
    expect(nightFires(r.fires)).toEqual([]);
    // 次晚 23 点：新夜晚键重新触发（先断工作段避免伴生工时触发）
    r = reduceContextTick(
      r.state,
      tick({ now: T0 + DAY, hour: 23, nightKey: 'night-2026-10-21', activeNow: false }),
    );
    r = reduceContextTick(
      r.state,
      tick({ now: T0 + DAY + MIN, hour: 23, nightKey: 'night-2026-10-21', activeNow: true }),
    );
    expect(nightFires(r.fires)).toEqual([CONTEXT_SCENE_IDS.lateNight]);
  });

  it('人不活跃（锁屏/睡眠）时深夜不演', () => {
    const r = reduceContextTick(
      createInitialContextState(),
      tick({ now: T0, hour: 0, nightKey: 'night-x', activeNow: false }),
    );
    expect(r.fires).toEqual([]);
  });

  it('非深夜小时不触发', () => {
    const r = reduceContextTick(
      createInitialContextState(),
      tick({ now: T0, hour: 22, nightKey: 'night-x', activeNow: true }),
    );
    expect(r.fires).toEqual([]);
  });
});

describe('reduceContextTick：久未对话', () => {
  it('满 3 天且活跃时触发一次；新消息后重新武装', () => {
    // 仅取久未对话类 fire（各断言点之间插入不活跃 tick 断开工时段，隔离工时触发器）
    const longNoChatFires = (fires: ReturnType<typeof reduceContextTick>['fires']) =>
      fires.filter((f) => f.kind === 'longNoChat').map((f) => f.eventId);
    const breakStreak = (s: ReturnType<typeof reduceContextTick>['state'], at: number) =>
      reduceContextTick(s, tick({ now: at, activeNow: false, lastChatAt: null })).state;
    const lastChat = T0;
    let s = createInitialContextState();
    let r = reduceContextTick(
      s,
      tick({ now: lastChat + LONG_NO_CHAT_TRIGGER_MS - MIN, activeNow: true, lastChatAt: lastChat }),
    );
    expect(r.fires).toEqual([]);
    s = breakStreak(r.state, lastChat + LONG_NO_CHAT_TRIGGER_MS - 30_000);
    r = reduceContextTick(
      s,
      tick({ now: lastChat + LONG_NO_CHAT_TRIGGER_MS, activeNow: true, lastChatAt: lastChat }),
    );
    expect(longNoChatFires(r.fires)).toEqual([CONTEXT_SCENE_IDS.longNoChat]);
    // 同一无对话间隔不重复
    s = breakStreak(r.state, lastChat + LONG_NO_CHAT_TRIGGER_MS + 30_000);
    r = reduceContextTick(
      s,
      tick({ now: lastChat + 4 * DAY, activeNow: true, lastChatAt: lastChat }),
    );
    expect(longNoChatFires(r.fires)).toEqual([]);
    // 用户回来聊过：lastChatAt 前进，重新计时
    s = breakStreak(r.state, lastChat + 4 * DAY + 30_000);
    const newChat = lastChat + 4 * DAY;
    r = reduceContextTick(
      s,
      tick({ now: newChat + LONG_NO_CHAT_TRIGGER_MS, activeNow: true, lastChatAt: newChat }),
    );
    expect(longNoChatFires(r.fires)).toEqual([CONTEXT_SCENE_IDS.longNoChat]);
  });

  it('不活跃或无消息历史时不触发', () => {
    const r1 = reduceContextTick(
      createInitialContextState(),
      tick({ now: T0 + 10 * DAY, activeNow: false, lastChatAt: T0 }),
    );
    expect(r1.fires).toEqual([]);
    const r2 = reduceContextTick(
      createInitialContextState(),
      tick({ now: T0 + 10 * DAY, activeNow: true, lastChatAt: null }),
    );
    expect(r2.fires).toEqual([]);
  });
});

describe('reduceContextTick：组合 tick', () => {
  it('深夜 + 久未对话同时成立时两个剧本都产出（队列仲裁交导演）', () => {
    const lastChat = T0 - 4 * DAY;
    const r = reduceContextTick(createInitialContextState(), {
      now: T0,
      hour: 23,
      nightKey: 'night-2026-10-20',
      activeNow: true,
      lastChatAt: lastChat,
    });
    expect(r.fires.map((f) => f.eventId).sort()).toEqual(
      [CONTEXT_SCENE_IDS.lateNight, CONTEXT_SCENE_IDS.longNoChat].sort(),
    );
  });
});
