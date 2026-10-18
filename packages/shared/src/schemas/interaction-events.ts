/**
 * 桌宠交互事件归一化类型。
 *
 * 所有触发源（触摸/感知/对话/关系等级）在进入 Resolver 之前统一归一成 InteractionEvent。
 * 类型 + 少量运行时枚举（区域/手势常量与触发键构造），无外部依赖。
 */

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

export type TouchEvent = TouchEventBase;

export interface ContextEvent {
  kind: 'context';
  trigger: 'lateNight' | 'longNoChat' | 'workStreak';
}

export interface SystemEvent {
  kind: 'system';
  signal: 'idle' | 'locked' | 'wake' | 'voice-start' | 'voice-end';
}

export interface RelationshipEvent {
  kind: 'relationship';
  level: 'stranger' | 'acquaintance' | 'partner' | 'intimate';
  /** 变化值（正数升级/负数降级） */
  delta: number;
}

export interface ChatEvent {
  kind: 'chat';
  subtype: 'mention' | 'new-message';
  assistantId?: string;
}
