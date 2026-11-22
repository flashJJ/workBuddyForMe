/**
 * v4.20：首字基线（最近 20 轮成功完成的本地 P50）。
 *
 * 只保存耗时数字，不保存消息内容；阈值 = min(P50 × 1.5, 10s)，无基线时 10s。
 */
export const FIRST_TOKEN_SAMPLES_KEY = 'wbfm:perf:first-token-samples';
export const FIRST_TOKEN_SAMPLE_LIMIT = 20;
export const FIRST_TOKEN_ABSOLUTE_LIMIT_MS = 10_000;

/** 线性插值百分位；空数组返回 null */
export function percentile(values: number[], p: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const value = sorted[low]! + (sorted[high]! - sorted[low]!) * (rank - low);
  return Math.round(value);
}

/** 首字阈值：相对基线 + 绝对兜底 */
export function firstTokenThreshold(samples: number[]): number {
  const p50 = percentile(samples, 50);
  if (p50 === null) return FIRST_TOKEN_ABSOLUTE_LIMIT_MS;
  return Math.min(Math.round(p50 * 1.5), FIRST_TOKEN_ABSOLUTE_LIMIT_MS);
}

function isValidSample(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** 读取基线样本：损坏 JSON、非数组或非法值一律丢弃 */
export function readFirstTokenSamples(storage: Pick<Storage, 'getItem'> | null | undefined): number[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(FIRST_TOKEN_SAMPLES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSample).slice(-FIRST_TOKEN_SAMPLE_LIMIT);
  } catch {
    return [];
  }
}

/** 追加一轮样本并保留最近 20 轮；返回更新后的数组 */
export function appendFirstTokenSample(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
  value: number,
): number[] {
  const next = [...readFirstTokenSamples(storage)];
  if (isValidSample(value)) next.push(Math.round(value));
  const trimmed = next.slice(-FIRST_TOKEN_SAMPLE_LIMIT);
  if (storage) {
    try {
      storage.setItem(FIRST_TOKEN_SAMPLES_KEY, JSON.stringify(trimmed));
    } catch {
      // 隐私模式/配额失败不影响对话
    }
  }
  return trimmed;
}
