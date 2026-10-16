/**
 * 桌宠交互 Resolver——纯函数查表，把 InteractionEvent 映射成 ActionChain[]。
 *
 * M1 扩展：
 * - body 区域 tap/longpress 动作链
 * - ResolverContext 加 relationshipLevel 门控
 * - 陌生人档拦截 raised 区域（不让提起）+ 不让长按
 *
 * 设计原则：
 * - 纯函数，无副作用，可完整单测
 * - 查表优先（硬编码模板），查不到返回 null 让 Executor 跳过
 * - 门控前置：勿扰/关系等级/冷却 未通过直接 null，不进入动作构造
 * - shared 包严格 ≤240 行
 */

import type { InteractionEvent, TouchEvent, TouchRegion } from './interaction-events';
import type { ActionChain } from './interaction-actions';

export type RelationshipLevel = 'stranger' | 'acquaintance' | 'partner' | 'intimate';

export interface ResolverContext {
  /** 当前小时 0..23，用于勿扰时段 */
  hour: number;
  /** 模型能力标记 */
  capabilities: { hasTapClip: boolean; hasSpringBone: boolean };
  /** 上次触发时间戳 per region */
  lastTriggerAt?: Partial<Record<TouchRegion, number>>;
  /** 当前关系等级（v2.0 relationship kernel 读） */
  relationshipLevel: RelationshipLevel;
  /** 情绪系统开关 */
  emotionEnabled: boolean;
}

/** 勿扰时段：23:00-06:00 */
const DO_NOT_DISTURB_HOURS = new Set([0, 1, 2, 3, 4, 5, 23]);

/** 冷却 per region（ms） */
const DEFAULT_COOLDOWN = {
  head: 500, body: 800, raised: 1500, pinch: 2000, unknown: 800,
} as const satisfies Record<TouchRegion, number>;

/** 最低解锁等级 per (region, gesture) — 关系等级不够直接 null */
const MIN_LEVEL: Partial<Record<string, RelationshipLevel>> = {
  // 陌生人：不让长按（害羞链太亲密），不让提起（raised 区域是「被提起」动作）
  'touch::head::longpress': 'acquaintance',
  'touch::raised::tap': 'partner',   // 提起需要搭档以上才能操作
  'touch::raised::longpress': 'partner',
  'touch::pinch::tap': 'partner',
};

/** 动作模板表 */
const ACTION_TABLE: Record<string, () => ActionChain> = {
  'touch::head::tap': () => ({
    actions: [
      { type: 'interaction.start', kind: 'head-touch' },
      { type: 'controller.playSquash' },
      { type: 'controller.flashExpression', tag: 'joy', durationMs: 2600 },
    ],
    priority: 'normal',
    cooldownMs: DEFAULT_COOLDOWN.head,
  }),

  'touch::head::longpress': () => ({
    actions: [
      { type: 'interaction.start', kind: 'head-touch' },
      { type: 'controller.playSquash', scaleX: 1.06, scaleY: 0.96, durationMs: 400 },
      { type: 'controller.flashExpression', tag: 'surprise', durationMs: 4200 },
    ],
    priority: 'high',
    cooldownMs: DEFAULT_COOLDOWN.head * 2,
  }),

  // body 区域：微弹 + smirk + 俏皮短句（幅度减半，因为身体比头部"钝"）
  'touch::body::tap': () => ({
    actions: [
      { type: 'interaction.start', kind: 'body-touch' },
      { type: 'controller.playSquash', scaleX: 1.02, scaleY: 0.98, durationMs: 160 },
      { type: 'controller.flashExpression', tag: 'smirk', durationMs: 1800 },
    ],
    priority: 'normal',
    cooldownMs: DEFAULT_COOLDOWN.body,
  }),

  'touch::body::longpress': () => ({
    actions: [
      { type: 'interaction.start', kind: 'body-touch' },
      { type: 'controller.playSquash', scaleX: 1.03, scaleY: 0.97, durationMs: 200 },
      { type: 'controller.flashExpression', tag: 'joy', durationMs: 2400 },
    ],
    priority: 'normal',
    cooldownMs: DEFAULT_COOLDOWN.body * 2,
  }),

  // raised：提起小区域触发"被提起"动作（需要 partner 以上）
  'touch::raised::tap': () => ({
    actions: [
      { type: 'interaction.start', kind: 'raised' },
      { type: 'controller.playSquash', scaleX: 0.94, scaleY: 1.08, durationMs: 300 },
      { type: 'controller.flashExpression', tag: 'surprise', durationMs: 2000 },
    ],
    priority: 'high',
    cooldownMs: DEFAULT_COOLDOWN.raised,
  }),
};

const LEVEL_ORDER: RelationshipLevel[] = ['stranger', 'acquaintance', 'partner', 'intimate'];
function levelAtLeast(current: RelationshipLevel, min: RelationshipLevel): boolean {
  return LEVEL_ORDER.indexOf(current) >= LEVEL_ORDER.indexOf(min);
}

/** Resolver 纯函数 */
export function resolveInteraction(
  event: InteractionEvent,
  ctx: ResolverContext,
): ActionChain | null {
  // 勿扰时段——只有 system.voice-end 放行
  if (DO_NOT_DISTURB_HOURS.has(ctx.hour)) {
    if (!(event.kind === 'system' && event.signal === 'voice-end')) {
      return null;
    }
  }

  if (event.kind === 'touch') {
    return resolveTouch(event, ctx);
  }
  // M1 仍只 cover touch，context/system/relationship 事件 M2 接
  return null;
}

function resolveTouch(e: TouchEvent, ctx: ResolverContext): ActionChain | null {
  const key = `touch::${e.region}::${e.gesture}`;

  // 关系等级门控
  const minLevel = MIN_LEVEL[key];
  if (minLevel && !levelAtLeast(ctx.relationshipLevel, minLevel)) {
    return null;
  }

  // 冷却闸门
  const last = ctx.lastTriggerAt?.[e.region] ?? 0;
  const cooldown = DEFAULT_COOLDOWN[e.region];
  if (Date.now() - last < cooldown) {
    return null;
  }

  const maker = ACTION_TABLE[key];
  if (!maker) return null;

  // emotionEnabled 门控：关掉的话表情相关动作剥离——但 squash 和 interaction.start 还是保留
  // M1 暂不精细过滤（emotionEnabled 目前只影响情绪状态 kernel，不影响 UI 动作）

  return maker();
}
