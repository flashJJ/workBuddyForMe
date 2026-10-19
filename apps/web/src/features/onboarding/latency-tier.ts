/**
 * v2.4 M1 T5：首字延迟结论分档（M0 §6 冻结：≤1.5s「流畅」/ ≤5s「偏慢但可用」/ >5s「建议换来源」）。
 * 纯函数，便于单测；超时或未取到首字一律落 timeout 档。
 */
export const LATENCY_SMOOTH_MAX_MS = 1500;
export const LATENCY_SLOW_MAX_MS = 5000;

export type LatencyTier = 'smooth' | 'slow' | 'timeout';

export function latencyTier(firstTokenMs: number | null): LatencyTier {
  if (firstTokenMs === null) return 'timeout';
  if (firstTokenMs <= LATENCY_SMOOTH_MAX_MS) return 'smooth';
  if (firstTokenMs <= LATENCY_SLOW_MAX_MS) return 'slow';
  return 'timeout';
}

/** 首字秒数展示（保留一位小数） */
export function formatLatencySeconds(firstTokenMs: number): string {
  return (firstTokenMs / 1000).toFixed(1);
}
