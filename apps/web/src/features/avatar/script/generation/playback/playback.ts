import {
  PET_SCRIPT_PLAYBACK_LIMITS,
  type PetScriptPlaybackSummary,
} from '@wbfm/shared/schemas';
import { isQuietHour, type QuietHours } from '../schedule/schedule';

/**
 * P8.8：主动播放预算（纯函数）。
 *
 * - 与自动生成分开记账：生成次数不等于播放次数，断网时也能播已有队列；
 * - 每日场次默认 3、可配置 0–10（0 = 不主动播放），跨天清零；
 * - 今日已播场景 id 去重，避免同一场在空闲窗口里反复演出；
 * - 勿扰判定复用 P8.7 的时段规则；通过后先扣预算再交给客户端演出。
 */

export const PET_SCRIPT_PLAYBACK_KEY = 'pet-script.playback';

export interface PlaybackState {
  /** YYYY-MM-DD（本地时区） */
  date: string;
  perDay: number;
  idleMinutes: number;
  playsToday: number;
  lastPlayedAt: number | null;
  /** 今日已主动播放的场景 id（新→旧） */
  playedSceneIds: string[];
}

export interface PetScriptPlaybackStore {
  load(): unknown;
  save(state: PlaybackState): void;
}

export type PlaybackBlockReason = 'disabled' | 'quiet-hours' | 'daily-cap' | 'duplicate';

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function normalizePlaybackPerDay(value: unknown): number {
  const { defaultPerDay, minPerDay, maxPerDay } = PET_SCRIPT_PLAYBACK_LIMITS;
  return clampInt(value, defaultPerDay, minPerDay, maxPerDay);
}

export function normalizePlaybackIdleMinutes(value: unknown): number {
  const { defaultIdleMinutes, minIdleMinutes, maxIdleMinutes } = PET_SCRIPT_PLAYBACK_LIMITS;
  return clampInt(value, defaultIdleMinutes, minIdleMinutes, maxIdleMinutes);
}

/** 跨天重置今日场次与去重列表，保留用户配置 */
export function resolvePlaybackState(raw: unknown, date: string): PlaybackState {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const perDay = normalizePlaybackPerDay(value?.perDay);
  const idleMinutes = normalizePlaybackIdleMinutes(value?.idleMinutes);
  if (!value || value.date !== date) {
    return { date, perDay, idleMinutes, playsToday: 0, lastPlayedAt: null, playedSceneIds: [] };
  }
  return {
    date,
    perDay,
    idleMinutes,
    playsToday: clampInt(value.playsToday, 0, 0, PET_SCRIPT_PLAYBACK_LIMITS.maxPerDay),
    lastPlayedAt:
      typeof value.lastPlayedAt === 'number' && Number.isFinite(value.lastPlayedAt)
        ? value.lastPlayedAt
        : null,
    playedSceneIds: Array.isArray(value.playedSceneIds)
      ? value.playedSceneIds.filter((id): id is string => typeof id === 'string').slice(0, 50)
      : [],
  };
}

export function setPlaybackPerDay(state: PlaybackState, perDay: number): PlaybackState {
  return { ...state, perDay: normalizePlaybackPerDay(perDay) };
}

export function setPlaybackIdleMinutes(state: PlaybackState, idleMinutes: number): PlaybackState {
  return { ...state, idleMinutes: normalizePlaybackIdleMinutes(idleMinutes) };
}

export function playbackSummary(state: PlaybackState): PetScriptPlaybackSummary {
  return {
    perDay: state.perDay,
    playsToday: state.playsToday,
    idleMinutes: state.idleMinutes,
    playedSceneIds: [...state.playedSceneIds],
  };
}

/** 该场景现在能否主动播放；返回 null 表示可播 */
export function playbackBlockReason(
  state: PlaybackState,
  sceneId: string,
  hour: number,
  quiet: QuietHours | null | undefined,
): PlaybackBlockReason | null {
  if (state.perDay <= 0) return 'disabled';
  if (isQuietHour(hour, quiet)) return 'quiet-hours';
  if (state.playsToday >= state.perDay) return 'daily-cap';
  if (state.playedSceneIds.includes(sceneId)) return 'duplicate';
  return null;
}

/** 认领成功：扣一次预算并记录去重（新记录在前） */
export function markPlayback(state: PlaybackState, sceneId: string, now: number): PlaybackState {
  return {
    ...state,
    playsToday: state.playsToday + 1,
    lastPlayedAt: now,
    playedSceneIds: [sceneId, ...state.playedSceneIds.filter((id) => id !== sceneId)].slice(0, 50),
  };
}
