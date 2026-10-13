import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_EVENT_INTENTS,
  BUILT_IN_EVENTS,
  BUILT_IN_TRIGGERS,
  eventIdForIntent,
  getBuiltInEvent,
  getTriggerSpec,
} from './index';

/** M0 冻结稿 02 §4 汇总表（id → [priority, cooldownMs, maxPerDay, stepCount]） */
const FROZEN_TABLE: Record<string, [number, number, number, number]> = {
  'ev.greeting.morning': [1, 43_200_000, 1, 8],
  'ev.greeting.night': [1, 43_200_000, 1, 8],
  'ev.greeting.welcome': [2, 28_800_000, 3, 12],
  'ev.relation.praised': [1, 1_800_000, 3, 12],
  'ev.touch.shy': [1, 600_000, 2, 9],
  'ev.relation.comfort': [2, 21_600_000, 2, 10],
  'ev.task.success': [2, 300_000, 5, 6],
  // failure 正文 JSON 为 7 步（02 文档汇总表写 6 系笔误，以冻结 JSON 为准）
  'ev.task.failure': [3, 300_000, 5, 7],
};

describe('内置剧本注册表（M0 冻结）', () => {
  it('恰好 8 个内置剧本且全部可按 id 取回', () => {
    expect(BUILT_IN_EVENTS.map((e) => e.id).sort()).toEqual(Object.keys(FROZEN_TABLE).sort());
    for (const id of Object.keys(FROZEN_TABLE)) {
      expect(getBuiltInEvent(id)?.id).toBe(id);
    }
    expect(getBuiltInEvent('ev.nope')).toBeNull();
  });

  it('priority/cooldown/maxPerDay/step 数与冻结汇总表逐项一致', () => {
    for (const def of BUILT_IN_EVENTS) {
      const [priority, cooldownMs, maxPerDay, stepCount] = FROZEN_TABLE[def.id]!;
      expect(def.priority).toBe(priority);
      expect(def.cooldownMs).toBe(cooldownMs);
      expect(def.maxPerDay).toBe(maxPerDay);
      expect(def.steps).toHaveLength(stepCount);
      expect(def.builtIn).toBe(true);
    }
  });

  it('所有 speech lineKey 形如 event.*（i18n 真源约束）', () => {
    for (const def of BUILT_IN_EVENTS) {
      for (const step of def.steps) {
        if (step.kind === 'speech') {
          expect(step.lineKey).toMatch(/^event\.[a-zA-Z0-9.]+$/);
        }
      }
    }
  });
});

describe('内置触发器元数据', () => {
  it('8 个意图一一映射到 8 个内置剧本且 uiOnly 仅任务族', () => {
    expect(BUILT_IN_TRIGGERS).toHaveLength(BUILT_IN_EVENT_INTENTS.length);
    for (const spec of BUILT_IN_TRIGGERS) {
      expect(eventIdForIntent(spec.intent)).toBe(spec.eventId);
      expect(getBuiltInEvent(spec.eventId)).not.toBeNull();
      expect(getTriggerSpec(spec.eventId)).toEqual(spec);
      expect(spec.uiOnly ?? false).toBe(
        spec.eventId === 'ev.task.success' || spec.eventId === 'ev.task.failure',
      );
    }
  });
});
