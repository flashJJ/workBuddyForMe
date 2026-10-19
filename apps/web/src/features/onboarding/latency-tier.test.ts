import { describe, expect, it } from 'vitest';
import {
  LATENCY_SLOW_MAX_MS,
  LATENCY_SMOOTH_MAX_MS,
  formatLatencySeconds,
  latencyTier,
} from './latency-tier';

describe('v2.4 M1 T5 首字延迟分档（M0 §6 冻结）', () => {
  it('三档边界：≤1.5s 流畅 / ≤5s 偏慢但可用 / >5s 建议换来源', () => {
    expect(latencyTier(0)).toBe('smooth');
    expect(latencyTier(LATENCY_SMOOTH_MAX_MS)).toBe('smooth');
    expect(latencyTier(LATENCY_SMOOTH_MAX_MS + 1)).toBe('slow');
    expect(latencyTier(LATENCY_SLOW_MAX_MS)).toBe('slow');
    expect(latencyTier(LATENCY_SLOW_MAX_MS + 1)).toBe('timeout');
  });

  it('未取到首字（null）落 timeout 档', () => {
    expect(latencyTier(null)).toBe('timeout');
  });

  it('秒数展示保留一位小数', () => {
    expect(formatLatencySeconds(0)).toBe('0.0');
    expect(formatLatencySeconds(1234)).toBe('1.2');
    expect(formatLatencySeconds(5000)).toBe('5.0');
  });
});
