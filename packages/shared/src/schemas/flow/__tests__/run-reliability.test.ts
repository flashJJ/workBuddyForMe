import { describe, expect, it } from 'vitest';
import {
  FLOW_BATCH_REPLAY_LIMIT,
  FLOW_COMPENSATION_BACKOFF_MS,
  canonicalJsonStringify,
  flowRunBatchReplaySchema,
  flowRunRetentionSchema,
} from '../run-reliability';

describe('v5.0 run-reliability schema', () => {
  it('批量重放上限 20', () => {
    const runIds = Array.from({ length: FLOW_BATCH_REPLAY_LIMIT + 1 }, (_, i) => `r${i}`);
    expect(flowRunBatchReplaySchema.safeParse({ runIds }).success).toBe(false);
    expect(flowRunBatchReplaySchema.safeParse({ runIds: runIds.slice(0, 20) }).success).toBe(true);
  });

  it('批量重放默认值由服务层补齐，schema 不强制', () => {
    const parsed = flowRunBatchReplaySchema.parse({ runIds: ['r1'] });
    expect(parsed.mode).toBeUndefined();
    expect(parsed.nodeMode).toBeUndefined();
  });

  it('保留策略边界', () => {
    expect(
      flowRunRetentionSchema.safeParse({
        enabled: true,
        successDays: 30,
        failureDays: 90,
        maxPerWorkflow: 500,
      }).success,
    ).toBe(true);
    expect(
      flowRunRetentionSchema.safeParse({
        enabled: true,
        successDays: 0,
        failureDays: 90,
        maxPerWorkflow: 500,
      }).success,
    ).toBe(false);
    expect(
      flowRunRetentionSchema.safeParse({
        enabled: true,
        successDays: 30,
        failureDays: 90,
        maxPerWorkflow: 10,
      }).success,
    ).toBe(false);
  });

  it('canonical JSON：键排序、数组保序、undefined 忽略', () => {
    const a = { b: 2, a: 1, list: [{ z: 1, y: 2 }, 3], skip: undefined };
    const b = { list: [{ y: 2, z: 1 }, 3], a: 1, b: 2, skip: undefined };
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    expect(canonicalJsonStringify(a)).toBe('{"a":1,"b":2,"list":[{"y":2,"z":1},3]}');
  });

  it('退避阶梯固定 30s/2m/10m', () => {
    expect(FLOW_COMPENSATION_BACKOFF_MS).toEqual([30_000, 120_000, 600_000]);
  });
});
