import type { Scene } from '@wbfm/shared/schemas';
import { localDateKey } from '../state';
import type { QuietHours } from '../schedule/schedule';
import {
  markPlayback,
  playbackBlockReason,
  playbackSummary,
  resolvePlaybackState,
  setPlaybackIdleMinutes,
  setPlaybackPerDay,
  type PetScriptPlaybackStore,
} from './playback';
import type {
  PetScriptPlaybackClaimResult,
  PetScriptPlaybackSummary,
} from '@wbfm/shared/schemas';

/**
 * P8.8：主动播放服务（服务端）。
 *
 * 客户端在空闲时挑选候选场景并调用 claim；服务端负责预算、勿扰、去重与队列校验。
 * 先扣预算再演出：即使客户端随后播放失败，也不会在同一空闲窗口反复重试。
 */

export interface PetScriptPlaybackDeps {
  store: PetScriptPlaybackStore;
  /** 当前生成队列（新→旧） */
  listScenes: () => readonly Scene[];
  quietHours?: () => QuietHours | null;
  now?: () => Date;
}

export interface PetScriptPlaybackService {
  summary(): PetScriptPlaybackSummary;
  setPerDay(perDay: number): PetScriptPlaybackSummary;
  setIdleMinutes(idleMinutes: number): PetScriptPlaybackSummary;
  claim(sceneId: string): PetScriptPlaybackClaimResult;
}

export function createPetScriptPlaybackService(
  deps: PetScriptPlaybackDeps,
): PetScriptPlaybackService {
  const now = deps.now ?? (() => new Date());

  function load() {
    return resolvePlaybackState(deps.store.load(), localDateKey(now()));
  }

  function reject(
    reason: PetScriptPlaybackClaimResult['reason'],
    summary: PetScriptPlaybackSummary,
  ): PetScriptPlaybackClaimResult {
    return { ok: false, reason, sceneId: null, playback: summary };
  }

  return {
    summary: () => playbackSummary(load()),
    setPerDay(perDay) {
      const next = setPlaybackPerDay(load(), perDay);
      deps.store.save(next);
      return playbackSummary(next);
    },
    setIdleMinutes(idleMinutes) {
      const next = setPlaybackIdleMinutes(load(), idleMinutes);
      deps.store.save(next);
      return playbackSummary(next);
    },
    claim(sceneId) {
      const state = load();
      const summary = playbackSummary(state);
      if (!sceneId.startsWith('gen.')) return reject('not-generated', summary);
      if (!deps.listScenes().some((scene) => scene.id === sceneId)) {
        return reject('not-generated', summary);
      }
      const blocked = playbackBlockReason(state, sceneId, now().getHours(), deps.quietHours?.());
      if (blocked) return reject(blocked, summary);
      const next = markPlayback(state, sceneId, now().getTime());
      deps.store.save(next);
      return { ok: true, reason: 'ok', sceneId, playback: playbackSummary(next) };
    },
  };
}
