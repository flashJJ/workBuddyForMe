/**
 * v1.7 准入闸门纯函数：勿扰时段 + 频率档冷却系数。
 * 总开关/有无出口是布尔谓词，由 director 直接读 gates，不在此重复。
 */
import {
  EVENT_FREQUENCY_FACTORS,
  type EventFrequencyTier,
} from '@wbfm/shared/schemas';

/**
 * 本地小时是否落在勿扰区间 [startHour, endHour)。
 * 支持跨夜（start=23,end=8 → 23..23 与 0..7 命中）；
 * start===end 视为全天勿扰（非法配置的保守解释）。
 */
export function isQuietHour(hour: number, startHour: number, endHour: number): boolean {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return true;
  if (startHour === endHour) return true;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

/** 频率档作用后的有效冷却（low 拉长、high 缩短；结果向下取整毫秒） */
export function effectiveCooldown(cooldownMs: number, tier: EventFrequencyTier): number {
  const factor = EVENT_FREQUENCY_FACTORS[tier] ?? 1;
  return Math.round(cooldownMs * factor);
}
