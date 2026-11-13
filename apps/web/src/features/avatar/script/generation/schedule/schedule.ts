import {
  PET_SCRIPT_SCHEDULE_LIMITS,
  type PetScriptScheduleSummary,
} from '@wbfm/shared/schemas';

/**
 * P8.5/P8.6：每日自动生成的轻量调度（不新建常驻定时器）。
 *
 * - 间隔机制：启用后第一次检查立即到期，之后两次之间至少间隔 30 分钟；
 * - 客户端每小时心跳一次 tick，因此实际节奏约为每小时最多一场；
 * - 每日次数默认 5、可在设置页配置 0–24（0 = 不生成），达到上限后当天不再触发；
 * - 默认关闭，`enabled` / `perDay` 跨天保留，`runsToday` / `lastRunAt` 每天清零。
 */

export const PET_SCRIPT_SCHEDULE_KEY = 'pet-script.schedule';
/** 两次自动生成之间的最小间隔 */
export const SCHEDULE_MIN_INTERVAL_MS = 30 * 60 * 1000;

export interface ScheduleState {
  /** YYYY-MM-DD（本地时区） */
  date: string;
  enabled: boolean;
  perDay: number;
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

/** 次数归一到 0–24；旧数据没有该字段时用默认值 */
export function normalizePerDay(value: unknown): number {
  const { defaultPerDay, minPerDay, maxPerDay } = PET_SCRIPT_SCHEDULE_LIMITS;
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultPerDay;
  return Math.min(maxPerDay, Math.max(minPerDay, Math.floor(value)));
}

/** 跨天重置今日次数与上次运行时间，保留用户开关与每日次数 */
export function resolveScheduleState(raw: unknown, date: string): ScheduleState {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const perDay = normalizePerDay(value?.perDay);
  if (!value) return { date, enabled: false, perDay, runsToday: 0, lastRunAt: null };
  const enabled = value.enabled === true;
  if (value.date !== date) return { date, enabled, perDay, runsToday: 0, lastRunAt: null };
  return {
    date,
    enabled,
    perDay,
    runsToday: countOrZero(value.runsToday),
    lastRunAt: numberOrNull(value.lastRunAt),
  };
}

export function setScheduleEnabled(state: ScheduleState, enabled: boolean): ScheduleState {
  return { ...state, enabled };
}

export function setSchedulePerDay(state: ScheduleState, perDay: number): ScheduleState {
  return { ...state, perDay: normalizePerDay(perDay) };
}

export function scheduleSummary(state: ScheduleState): PetScriptScheduleSummary {
  return {
    enabled: state.enabled,
    perDay: state.perDay,
    runsToday: state.runsToday,
  };
}

/** 到期判定：首次立即到期；之后距上次运行满 30 分钟且当天次数未用尽 */
export function isScheduleDue(state: ScheduleState, now: Date): boolean {
  if (!state.enabled) return false;
  if (state.runsToday >= state.perDay) return false;
  if (state.lastRunAt === null) return true;
  return now.getTime() - state.lastRunAt >= SCHEDULE_MIN_INTERVAL_MS;
}

export function markScheduleRun(state: ScheduleState, now: Date): ScheduleState {
  return { ...state, runsToday: state.runsToday + 1, lastRunAt: now.getTime() };
}
