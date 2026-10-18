'use client';

import { TriggerBus } from './trigger-bus';
import { getPetBridge } from '@/features/pet/pet-bridge';
import type { InteractionEvent } from '@wbfm/shared/schemas';

/**
 * M2 事件剧本 ↔ InteractionEvent 映射表。
 *
 * 把 EventDirector 的内置事件 sceneId 反解成 InteractionEvent，
 * 让 Resolver 能对事件剧本也做统一路由（走剧本还是直接 controller）。
 *
 * 注意：EventDirector 内部有自己完整的门控（CONV 锁/勿扰/冷却/每日上限），
 * Resolver 不在这重复门控——它只做路由决策 + 让 TriggerBus.emit 统一观测。
 */
const SCENE_TO_EVENT: Record<string, InteractionEvent> = {
  // 触摸
  'ev.touch.shy': { kind: 'touch', region: 'head', gesture: 'longpress' },
  'ev.touch.cute': { kind: 'touch', region: 'body', gesture: 'tap' },

  // 感知（context-triggers.ts 注册表同步）
  'ev.context.latenight': { kind: 'context', trigger: 'lateNight' },
  'ev.context.longnochat': { kind: 'context', trigger: 'longNoChat' },
  'ev.context.workstreak': { kind: 'context', trigger: 'workStreak' },

  // 关系等级
  'ev.relationship.level_up': { kind: 'relationship', level: 'partner', delta: 1 },
};

/**
 * 从 eventId 反解 InteractionEvent，供 Resolver + TriggerBus 用。
 * 找不到映射时返回 null（跳过桥接，EventDirector 自行处理）。
 */
export function mapSceneToEvent(eventId: string): InteractionEvent | null {
  return SCENE_TO_EVENT[eventId] ?? null;
}

/**
 * 事件剧本触发桥——在 EventDirector.triggerEvent 入口调用。
 *
 * 职责：
 * 1. emit 到 TriggerBus（主窗统一观测）；
 * 2. v2.3 P2-2：**非触摸**事件（感知 / 系统信号 / 关系变化）中继到桌宠窗，
 *    由桌宠侧 Resolver 按动画图配置决定是否表演（内置图没有这些触发键的条目 → 缺省不表演）。
 *    触摸类剧本不中继（意图是「真实触摸」语义，避免与用户真实触摸双播）。
 */
export function bridgeEventFire(eventId: string): void {
  const event = mapSceneToEvent(eventId);
  if (!event) return;
  TriggerBus.emit(event);
  if (event.kind === 'touch') return;
  getPetBridge()?.relayPerformance({ kind: 'interaction', event });
}

/** 感知触发器 → InteractionEvent 映射（context-triggers.ts 用） */
export function mapContextTrigger(trigger: string): InteractionEvent | null {
  const map: Record<string, InteractionEvent> = {
    lateNight: { kind: 'context', trigger: 'lateNight' },
    longNoChat: { kind: 'context', trigger: 'longNoChat' },
    workStreak: { kind: 'context', trigger: 'workStreak' },
  };
  return map[trigger] ?? null;
}
