/**
 * 桌宠交互事件归一化类型。
 *
 * 所有触发源（触摸/感知/对话/关系等级）在进入 Resolver 之前统一归一成 InteractionEvent。
 * 类型 + 运行时枚举（区域/手势/感知/系统信号/关系方向）与触发键构造，无外部依赖。
 */

import type { RelationshipLevel } from './relationship-level';

/** 触发来源 */
export type InteractionEvent = TouchEvent | ContextEvent | SystemEvent | RelationshipEvent | ChatEvent;

export interface TouchEventBase {
  kind: 'touch';
  /** 命中区域 — 模型配置或 PetStage 分区 */
  region: TouchRegion;
  /** 手势类型 */
  gesture: TouchGesture;
  /** 按下持续毫秒（长按有效） */
  durationMs?: number;
}

/** 命中区域运行时枚举（类型从常量派生，UI/配置校验共用一份真源） */
export const TOUCH_REGIONS = ['head', 'body', 'raised', 'pinch', 'unknown'] as const;
export type TouchRegion = (typeof TOUCH_REGIONS)[number];

/** 手势运行时枚举 */
export const TOUCH_GESTURES = ['tap', 'longpress', 'double', 'swipe', 'release'] as const;
export type TouchGesture = (typeof TOUCH_GESTURES)[number];

/**
 * 触发冷却键 `touch::<region>::<gesture>`：调用方按此键记录 lastTriggerAt，
 * 配置侧也按此键校验动画图条目的合法触发键。
 */
export function touchTriggerKey(region: TouchRegion, gesture: TouchGesture): string {
  return `touch::${region}::${gesture}`;
}

/** 感知触发器运行时枚举（v2.2 P2-2：类型从常量派生，配置校验与 UI 共用一份真源） */
export const CONTEXT_TRIGGERS = ['lateNight', 'longNoChat', 'workStreak'] as const;
export type ContextTrigger = (typeof CONTEXT_TRIGGERS)[number];

/** 系统信号运行时枚举 */
export const SYSTEM_SIGNALS = ['idle', 'locked', 'wake', 'voice-start', 'voice-end'] as const;
export type SystemSignal = (typeof SYSTEM_SIGNALS)[number];

/** 关系事件的方向枚举（升级 / 降级；delta 为 0 的事件不产生触发键） */
export const RELATIONSHIP_DIRECTIONS = ['up', 'down'] as const;
export type RelationshipDirection = (typeof RELATIONSHIP_DIRECTIONS)[number];

export type TouchEvent = TouchEventBase;

export interface ContextEvent {
  kind: 'context';
  trigger: ContextTrigger;
}

export interface SystemEvent {
  kind: 'system';
  signal: SystemSignal;
}

export interface RelationshipEvent {
  kind: 'relationship';
  level: RelationshipLevel;
  /** 变化值（正数升级/负数降级） */
  delta: number;
}

export interface ChatEvent {
  kind: 'chat';
  subtype: 'mention' | 'new-message';
  assistantId?: string;
}
