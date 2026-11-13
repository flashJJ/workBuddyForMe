import type { PetScriptScheduleSummary } from '@wbfm/shared/schemas';

/**
 * P8.5：每日自动生成的轻量调度（不新建常驻定时器）。
 *
 * - 固定 10 点 / 16 点两个窗口，每日最多 2 次；
 * - 默认关闭，`enabled` 跨天保留，`runsToday` 每天清零；
 * - 两次至少间隔 4 小时，避免应用在晚上首次启动时连跑两次；
 * - 是否到期由纯函数判断，客户端 10 分钟心跳调用 tick 即可。
 */

export const PET_SCRIPT_SCHEDULE_KEY = 'pet-script.schedule';
export const SCHEDULE_SLOT_HOURS = [10, 16] as const;
const MIN_GAP_MS = 4 * 60 * 60 * 1000;

export interface ScheduleState {
  /** YYYY-MM-DD（本地时区） */
  date: string;
  enabled: boolean;
  runsToday: number;
  lastRunAt: number | null;
}

export interface PetScriptScheduleStore {
  load(): unknown;
  save(state: ScheduleState): void;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function countOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** 跨天只重置今日次数，保留用户开关 */
export function resolveScheduleState(raw: unknown, date: string): ScheduleState {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!value) return { date, enabled: false, runsToday: 0, lastRunAt: null };
  const enabled = value.enabled === true;
  if (value.date !== date) return { date, enabled, runsToday: 0, lastRunAt: null };
  return {
    date,
    enabled,
    runsToday: countOrZero(value.runsToday),
    lastRunAt: numberOrNull(value.lastRunAt),
  };
}

export function setScheduleEnabled(state: ScheduleState, enabled: boolean): ScheduleState {
  return { ...state, enabled };
}

export function scheduleSummary(state: ScheduleState): PetScriptScheduleSummary {
  return {
    enabled: state.enabled,
    perDay: SCHEDULE_SLOT_HOURS.length,
    runsToday: state.runsToday,
  };
}

/** 是否有一个已过时间且未消费的窗口（至少 4 小时间隔） */
export function isScheduleDue(state: ScheduleState, now: Date): boolean {
  if (!state.enabled) return false;
  const passedSlots = SCHEDULE_SLOT_HOURS.filter((hour) => now.getHours() >= hour).length;
  if (state.runsToday >= passedSlots) return false;
  if (state.lastRunAt !== null && now.getTime() - state.lastRunAt < MIN_GAP_MS) return false;
  return true;
}

export function markScheduleRun(state: ScheduleState, now: Date): ScheduleState {
  return { ...state, runsToday: state.runsToday + 1, lastRunAt: now.getTime() };
}
