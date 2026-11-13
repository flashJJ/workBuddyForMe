import { describe, expect, it } from 'vitest';
import type { Scene } from '@wbfm/shared/schemas';
import {
  markPlayback,
  playbackBlockReason,
  playbackSummary,
  resolvePlaybackState,
  setPlaybackIdleMinutes,
  setPlaybackPerDay,
} from './playback';
import { createPetScriptPlaybackService } from './service';
import type { PlaybackState } from './playback';

const DATE = '2026-11-14';
const NOW = new Date(2026, 10, 14, 10, 0);
const scene = (id: string) => ({ id }) as Scene;

function memoryStore(initial: unknown = null) {
  const box = {
    state: initial,
    load: () => box.state,
    save: (state: PlaybackState) => {
      box.state = state;
    },
  };
  return box;
}

describe('主动播放预算（P8.8）', () => {
  it('默认每日 3 场、空闲 10 分钟；跨天重置且保留配置', () => {
    const fresh = resolvePlaybackState(null, DATE);
    expect(fresh).toMatchObject({ perDay: 3, idleMinutes: 10, playsToday: 0, playedSceneIds: [] });

    const before = {
      ...fresh,
      perDay: 7,
      idleMinutes: 20,
      playsToday: 2,
      playedSceneIds: ['gen.a'],
    };
    expect(resolvePlaybackState(before, DATE)).toMatchObject({
      perDay: 7,
      idleMinutes: 20,
      playsToday: 2,
      playedSceneIds: ['gen.a'],
    });
    expect(resolvePlaybackState(before, '2026-11-15')).toMatchObject({
      perDay: 7,
      idleMinutes: 20,
      playsToday: 0,
      playedSceneIds: [],
    });
  });

  it('配置超界时收敛到 0–10 / 1–120', () => {
    const state = resolvePlaybackState(null, DATE);
    expect(setPlaybackPerDay(state, 99).perDay).toBe(10);
    expect(setPlaybackPerDay(state, -1).perDay).toBe(0);
    expect(setPlaybackIdleMinutes(state, 0).idleMinutes).toBe(1);
    expect(setPlaybackIdleMinutes(state, 999).idleMinutes).toBe(120);
  });

  it('阻断原因：关闭、勿扰、场次用尽、重复场景', () => {
    const state = resolvePlaybackState(null, DATE);
    expect(playbackBlockReason(state, 'gen.a', 10, null)).toBeNull();
    expect(playbackBlockReason({ ...state, perDay: 0 }, 'gen.a', 10, null)).toBe('disabled');
    expect(
      playbackBlockReason(state, 'gen.a', 23, { enabled: true, startHour: 23, endHour: 6 }),
    ).toBe('quiet-hours');
    expect(playbackBlockReason({ ...state, playsToday: 3 }, 'gen.a', 10, null)).toBe('daily-cap');
    expect(
      playbackBlockReason({ ...state, playedSceneIds: ['gen.a'] }, 'gen.a', 10, null),
    ).toBe('duplicate');
  });

  it('认领后扣预算并去重，摘要只读拷贝', () => {
    const state = resolvePlaybackState(null, DATE);
    const next = markPlayback(state, 'gen.a', NOW.getTime());
    expect(state.playedSceneIds).toEqual([]);
    expect(playbackSummary(next)).toMatchObject({
      playsToday: 1,
      playedSceneIds: ['gen.a'],
    });
    const summary = playbackSummary(next);
    summary.playedSceneIds.push('x');
    expect(next.playedSceneIds).toEqual(['gen.a']);
    expect(playbackSummary(next).playedSceneIds).not.toBe(next.playedSceneIds);
  });
});

describe('主动播放服务（P8.8）', () => {
  it('只接受队列内的 gen.* 场景，成功后落库', () => {
    const store = memoryStore();
    const service = createPetScriptPlaybackService({
      store,
      listScenes: () => [scene('gen.a'), scene('moment.wave')],
      now: () => NOW,
    });

    expect(service.claim('moment.wave')).toMatchObject({ ok: false, reason: 'not-generated' });
    expect(service.claim('gen.missing')).toMatchObject({ ok: false, reason: 'not-generated' });
    expect(service.summary().playsToday).toBe(0);

    expect(service.claim('gen.a')).toMatchObject({ ok: true, reason: 'ok', sceneId: 'gen.a' });
    expect(service.summary()).toMatchObject({ playsToday: 1, playedSceneIds: ['gen.a'] });
    expect(store.state).toMatchObject({ date: DATE, playsToday: 1 });
  });

  it('重复场景与每日上限被拒绝，且不额外扣预算', () => {
    const store = memoryStore();
    const service = createPetScriptPlaybackService({
      store,
      listScenes: () => [scene('gen.a'), scene('gen.b'), scene('gen.c')],
      now: () => NOW,
    });
    expect(service.claim('gen.a').ok).toBe(true);
    expect(service.claim('gen.a')).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(service.setPerDay(1).playsToday).toBe(1);
    expect(service.claim('gen.b')).toMatchObject({ ok: false, reason: 'daily-cap' });
    expect(service.summary().playsToday).toBe(1);
  });

  it('勿扰时段拒绝，0 场视为关闭；修改空闲阈值写回', () => {
    const service = createPetScriptPlaybackService({
      store: memoryStore(),
      listScenes: () => [scene('gen.a')],
      quietHours: () => ({ enabled: true, startHour: 23, endHour: 6 }),
      now: () => new Date(2026, 10, 14, 23, 30),
    });
    expect(service.claim('gen.a')).toMatchObject({ ok: false, reason: 'quiet-hours' });
    expect(service.setPerDay(0)).toMatchObject({ perDay: 0 });
    expect(service.claim('gen.a')).toMatchObject({ ok: false, reason: 'disabled' });
    expect(service.setIdleMinutes(30).idleMinutes).toBe(30);
  });
});
