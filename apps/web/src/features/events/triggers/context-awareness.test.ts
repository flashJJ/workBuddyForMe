import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WORK_STREAK_TRIGGER_MS,
  createInitialContextState,
} from '@wbfm/shared/events';
import {
  evaluateContextTick,
  isActiveNow,
  loadContextState,
  saveContextState,
  shanghaiHour,
  shanghaiNightKey,
} from './context-awareness';

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

describe('isActiveNow（系统空闲优先，应用内活动回落）', () => {
  it('已授权且有系统样本：按系统空闲秒数判定（5 分钟断口）', () => {
    expect(
      isActiveNow({ systemAware: true, systemIdleSeconds: 240, appInteractionMin: 999 }),
    ).toBe(true);
    expect(
      isActiveNow({ systemAware: true, systemIdleSeconds: 300, appInteractionMin: 0 }),
    ).toBe(false);
  });

  it('已授权但样本未到/未授权：回落应用内交互分钟数', () => {
    expect(
      isActiveNow({ systemAware: true, systemIdleSeconds: null, appInteractionMin: 4 }),
    ).toBe(true);
    expect(
      isActiveNow({ systemAware: false, systemIdleSeconds: null, appInteractionMin: 5 }),
    ).toBe(false);
    expect(
      isActiveNow({ systemAware: false, systemIdleSeconds: null, appInteractionMin: null }),
    ).toBe(false);
  });

  it('未授权时忽略系统样本，只认应用内活动', () => {
    expect(
      isActiveNow({ systemAware: false, systemIdleSeconds: 0, appInteractionMin: 10 }),
    ).toBe(false);
  });
});

describe('上海口径小时与夜归属键', () => {
  it('UTC 15:00 = 上海 23:00；UTC 16:30 = 上海次日 00:30 同夜键', () => {
    const evening = Date.UTC(2026, 9, 20, 15, 0);
    const pastMidnight = Date.UTC(2026, 9, 20, 16, 30);
    expect(shanghaiHour(evening)).toBe(23);
    expect(shanghaiHour(pastMidnight)).toBe(0);
    expect(shanghaiNightKey(evening)).toBe('2026-10-20');
    expect(shanghaiNightKey(pastMidnight)).toBe('2026-10-20');
  });

  it('上海 04:59 仍归前夜，05:00 归新一天', () => {
    const before = Date.UTC(2026, 9, 20, 20, 59);
    const after = Date.UTC(2026, 9, 20, 21, 0);
    expect(shanghaiHour(before)).toBe(4);
    expect(shanghaiNightKey(before)).toBe('2026-10-20');
    expect(shanghaiHour(after)).toBe(5);
    expect(shanghaiNightKey(after)).toBe('2026-10-21');
  });
});

describe('evaluateContextTick（渲染端装配集成）', () => {
  it('上海深夜活跃 + 持续工作 90 分钟：产出两个剧本', () => {
    // UTC 15:00 = 上海 23:00
    const t0 = Date.UTC(2026, 9, 20, 15, 0);
    let r = evaluateContextTick({
      state: createInitialContextState(),
      now: t0,
      activeNow: true,
      lastChatAt: null,
    });
    expect(r.fires.map((f) => f.eventId)).toEqual(['ev.context.latenight']);
    r = evaluateContextTick({
      state: r.state,
      now: t0 + WORK_STREAK_TRIGGER_MS,
      activeNow: true,
      lastChatAt: null,
    });
    expect(r.fires.map((f) => f.eventId)).toEqual(['ev.context.workstreak']);
  });
});

describe('context-awareness 边沿状态持久化', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('save/load 往返；损坏 JSON 回落初始态', () => {
    const localStorage = memStorage();
    vi.stubGlobal('window', { localStorage });
    const state = createInitialContextState();
    state.workStreak = { startedAt: 123, firedAt: 456 };
    saveContextState(state);
    expect(loadContextState().workStreak).toEqual({ startedAt: 123, firedAt: 456 });

    localStorage.setItem('wbfm.context-awareness.v1', '{bad json');
    expect(loadContextState()).toEqual(createInitialContextState());
  });

  it('无 window（SSR/node）：降级初始态且不抛错', () => {
    expect(loadContextState()).toEqual(createInitialContextState());
    expect(() => saveContextState(createInitialContextState())).not.toThrow();
  });
});
