import { describe, expect, it } from 'vitest';
import type { EventTriggerView } from '@wbfm/shared/schemas';
import {
  CustomTriggerGate,
  isWithinHourWindow,
  matchTrigger,
  meetsIntimacy,
} from './custom-trigger-gate';

function trigger(over: Partial<EventTriggerView> = {}): EventTriggerView {
  return {
    id: 't1',
    assistantId: 'a1',
    eventId: 'ev.relation.praised',
    phrases: ['辛苦了'],
    cooldownMs: 60_000,
    startHour: 0,
    endHour: 23,
    maxPerDay: 2,
    minIntimacy: 0,
    enabled: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

describe('自定义触发器纯函数', () => {
  it('matchTrigger：trim/包含/大小写不敏感', () => {
    expect(matchTrigger('你今天辛苦了呀', trigger())).toBe(true);
    expect(matchTrigger('完全不相干', trigger())).toBe(false);
    expect(matchTrigger('  辛苦 了 ', trigger({ phrases: [' 辛苦了 '] }))).toBe(false);
  });

  it('isWithinHourWindow：跨夜窗口', () => {
    expect(isWithinHourWindow(23, 22, 6)).toBe(true);
    expect(isWithinHourWindow(5, 22, 6)).toBe(true);
    expect(isWithinHourWindow(12, 22, 6)).toBe(false);
    expect(isWithinHourWindow(9, 9, 18)).toBe(true);
    expect(isWithinHourWindow(19, 9, 18)).toBe(false);
    // start===end 全天
    expect(isWithinHourWindow(3, 8, 8)).toBe(true);
  });

  it('meetsIntimacy：门槛比较', () => {
    expect(meetsIntimacy(9, 10)).toBe(false);
    expect(meetsIntimacy(10, 10)).toBe(true);
  });

  it('CustomTriggerGate：未命中短语/亲密度不足/时段外 → false 且不计数', () => {
    let now = 1_000_000;
    const gate = new CustomTriggerGate({ now: () => now, toDateKey: (ms) => new Date(ms).toISOString().slice(0, 10) });
    const t = trigger({ minIntimacy: 20, startHour: 9, endHour: 18 });
    expect(gate.admit(t, { text: '你好', hour: 10, intimacy: 50 })).toBe(false);
    expect(gate.admit(t, { text: '辛苦了', hour: 10, intimacy: 10 })).toBe(false);
    expect(gate.admit(t, { text: '辛苦了', hour: 20, intimacy: 50 })).toBe(false);
    // 全部未计数：随后条件满足仍可放行两次
    expect(gate.admit(t, { text: '辛苦了', hour: 10, intimacy: 50 })).toBe(true);
    now += 61_000;
    expect(gate.admit(t, { text: '辛苦了', hour: 10, intimacy: 50 })).toBe(true);
  });

  it('冷却与每日上限：冷却内拒绝；上限内、跨日后恢复', () => {
    let now = Date.UTC(2026, 9, 14, 2, 0, 0); // 上海 10:00
    const gate = new CustomTriggerGate({
      now: () => now,
      toDateKey: (ms) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10),
    });
    const t = trigger({ cooldownMs: 10 * 60_000, maxPerDay: 2 });
    expect(gate.admit(t, { text: '辛苦了', hour: 10, intimacy: 0 })).toBe(true);
    expect(gate.admit(t, { text: '辛苦了', hour: 10, intimacy: 0 })).toBe(false); // 冷却中
    now += 11 * 60_000;
    expect(gate.admit(t, { text: '辛苦了', hour: 10, intimacy: 0 })).toBe(true);
    now += 11 * 60_000;
    expect(gate.admit(t, { text: '辛苦了', hour: 10, intimacy: 0 })).toBe(false); // 当日上限
    // 次日重置
    now += 24 * 3600_000;
    expect(gate.admit(t, { text: '辛苦了', hour: 10, intimacy: 0 })).toBe(true);
  });

  it('禁用规则一律不放行', () => {
    const gate = new CustomTriggerGate({ now: () => 0 });
    const t = trigger({ enabled: false });
    expect(gate.admit(t, { text: '辛苦了', hour: 10, intimacy: 0 })).toBe(false);
  });
});
