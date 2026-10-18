/**
 * 桌宠交互 Resolver——纯函数查表，把 InteractionEvent 映射成 ActionChain。
 *
 * v2.3 M1：查表升级为「动画图条目 + 条件」（见 interaction-graph）。
 * v2.3 P2-2：不再只 cover 触摸——context / system / relationship 三类事件同样走触发键
 * 匹配（键口径见 eventTriggerKey），因此主动关怀与感知层也能驱动表演（有无动作由配置决定）。
 * 本文件只保留事件分流与门控（勿扰 / 冷却）。
 *
 * 设计原则：
 * - 纯函数，无副作用，可完整单测
 * - 查不到返回 null 让 Executor 跳过（动画图匹配全不中即返回空）
 * - 门控前置：勿扰/冷却 未通过直接 null，不进入动作构造
 * - shared 包严格 ≤240 行
 */

import type { InteractionEvent } from './interaction-events';
import type { ActionChain } from './interaction-actions';
import type { MotionMood } from './motion-asset';
import type { RelationshipLevel } from './relationship-level';
import { chainOf, DEFAULT_COOLDOWN } from './interaction-chains';
import {
  DEFAULT_INTERACTION_GRAPH,
  eventTriggerKey,
  isHourInWindow,
  resolveInteractionEntry,
  type InteractionGraphEntry,
} from './interaction-graph';

export { touchTriggerKey } from './interaction-events';
export { RELATIONSHIP_LEVEL_NAMES, relationshipLevelName } from './relationship-level';
export type { RelationshipLevel } from './relationship-level';

/**
 * 勿扰配置（v2.2 起可配置；缺省 23:00–06:00 开启）。
 * enabled=false 时不拦截任何交互；startHour===endHour 视为无勿扰窗口（恒放行）。
 */
export interface DoNotDisturbConfig {
  enabled: boolean;
  /** 起始小时（含），0–23 */
  startHour: number;
  /** 结束小时（不含），0–23 */
  endHour: number;
}

/** 勿扰缺省：开启，23:00–06:00（等价 v2.2 之前的硬编码口径） */
export const DEFAULT_DO_NOT_DISTURB: DoNotDisturbConfig = {
  enabled: true,
  startHour: 23,
  endHour: 6,
};

/** 纯函数：当前小时是否落在勿扰窗口内（支持跨零点；空窗口恒 false） */
export function isDoNotDisturbHour(hour: number, config: DoNotDisturbConfig): boolean {
  return config.enabled && isHourInWindow(hour, config.startHour, config.endHour);
}

/** 非触摸事件的默认冷却（ms）：防同一信号连发（如 voice-end 反复触发同一动作） */
export const DEFAULT_NON_TOUCH_COOLDOWN_MS = 2000;

/** 触发键冷却（ms）：触摸走按区域口径，其余事件统一默认值 */
export function cooldownForEvent(event: InteractionEvent): number {
  return event.kind === 'touch' ? DEFAULT_COOLDOWN[event.region] : DEFAULT_NON_TOUCH_COOLDOWN_MS;
}

export interface ResolverContext {
  /** 当前小时 0..23，用于勿扰时段 */
  hour: number;
  /** 模型能力标记 */
  capabilities: { hasTapClip: boolean; hasSpringBone: boolean };
  /** 上次触发时间戳 per 触发键（见 eventTriggerKey） */
  lastTriggerAt?: Partial<Record<string, number>>;
  /** 当前关系等级（v2.0 relationship kernel 读） */
  relationshipLevel: RelationshipLevel;
  /** 情绪系统开关 */
  emotionEnabled: boolean;
  /** v2.3：当前情绪档位（动画图条目的条件维度之一） */
  mood: MotionMood;
  /** v2.2：勿扰时段配置（缺省 DEFAULT_DO_NOT_DISTURB：23:00–06:00 开启） */
  doNotDisturb: DoNotDisturbConfig;
}

/**
 * Resolver 纯函数。
 * graph 可注入（缺省用内置动画图），供「配置覆盖 / 停用」接缝复用；
 * 语义不变：查不到返回 null（含对话事件——本版不建触发键）。
 */
export function resolveInteraction(
  event: InteractionEvent,
  ctx: ResolverContext,
  graph: readonly InteractionGraphEntry[] = DEFAULT_INTERACTION_GRAPH,
): ActionChain | null {
  // 勿扰时段——只有 system.voice-end 放行
  if (isDoNotDisturbHour(ctx.hour, ctx.doNotDisturb)) {
    if (!(event.kind === 'system' && event.signal === 'voice-end')) {
      return null;
    }
  }

  const key = eventTriggerKey(event);
  if (!key) return null;

  // 冷却闸门（按触发键计时，不同手势/事件互不吃冷却）
  const last = ctx.lastTriggerAt?.[key] ?? 0;
  if (Date.now() - last < cooldownForEvent(event)) {
    return null;
  }

  // 关系等级门槛 / 情绪档位 / 时段条件全部由动画图条目声明并匹配
  const entry = resolveInteractionEntry(graph, key, {
    relationshipLevel: ctx.relationshipLevel,
    mood: ctx.mood,
    hour: ctx.hour,
  });
  return entry ? chainOf(entry) : null;
}
