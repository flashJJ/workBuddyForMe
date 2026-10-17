/**
 * 桌宠交互事件归一化类型。
 *
 * 所有触发源（触摸/感知/对话/关系等级）在进入 Resolver 之前统一归一成 InteractionEvent。
 * 纯类型文件（<60 行），无运行时依赖。
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

export type TouchRegion = 'head' | 'body' | 'raised' | 'pinch' | 'unknown';
export type TouchGesture = 'tap' | 'longpress' | 'double' | 'swipe' | 'release';

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
