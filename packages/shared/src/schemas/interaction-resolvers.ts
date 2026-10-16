/**
 * 桌宠交互 Resolver——纯函数查表，把 InteractionEvent 映射成 ActionChain[]。
 *
 * M0 只覆盖 touch.tap + touch.longpress + 勿扰时段门控 + 频率闸门。
 * 不引入 EventDirector 桥和感知事件（M1/M2 再加）。
 *
 * 设计原则：
 * - 纯函数，无副作用，可完整单测
 * - 查表优先（硬编码模板），查不到返回 null 让 Executor 跳过
 * - 门控前置：勿扰/冷却 未通过直接 null，不进入动作构造
 * - shared 包严格 ≤240 行（M0 当前 130 行）
 */

import type { InteractionEvent, TouchEvent, TouchRegion } from './interaction-events';
import type { ActionChain, InteractionKind } from './interaction-actions';

export interface ResolverContext {
  /** 当前小时 0..23，用于勿扰时段 */
  hour: number;
  /** 模型能力标记（来自 controller.getCapabilities） */
  capabilities: { hasTapClip: boolean; hasSpringBone: boolean };
  /** 上次触发时间戳 per region（Executor 读） */
  lastTriggerAt?: Partial<Record<TouchRegion, number>>;
}

/** 勿扰时段：23:00-06:00 */
const DO_NOT_DISTURB_HOURS = new Set([0, 1, 2, 3, 4, 5, 23]);

/** 冷却 per region（ms） */
const DEFAULT_COOLDOWN = { head: 500, body: 800, raised: 1500, pinch: 2000, unknown: 800 } as const;

/** 动作模板表（M0 只 touch 两种） */
const ACTION_TABLE: Record<string, (e: TouchEvent) => ActionChain> = {
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
      { type: 'controller.flashExpression', tag: 'smirk', durationMs: 4200 },
    ],
    priority: 'high',
    cooldownMs: DEFAULT_COOLDOWN.head * 2,
  }),
};

/** Resolver 纯函数 */
export function resolveInteraction(
  event: InteractionEvent,
  ctx: ResolverContext,
): ActionChain | null {
  // 勿扰时段——只有 high 优先级放行，其他全挡
  if (DO_NOT_DISTURB_HOURS.has(ctx.hour)) {
    // 只有 'voice-end'（对话说话结束）在勿扰时段也放行（保持对话自然收尾）
    if (!(event.kind === 'system' && event.signal === 'voice-end')) {
      return null;
    }
  }

  if (event.kind === 'touch') {
    return resolveTouch(event, ctx);
  }
  // M0 只有 touch 事件，其他一律 null（不触发任何动作）
  return null;
}

function resolveTouch(e: TouchEvent, ctx: ResolverContext): ActionChain | null {
  // 冷却闸门
  const last = ctx.lastTriggerAt?.[e.region] ?? 0;
  const cooldown = DEFAULT_COOLDOWN[e.region];
  if (Date.now() - last < cooldown) {
    return null;
  }

  const key = `touch::${e.region}::${e.gesture}`;
  const maker = ACTION_TABLE[key];
  if (!maker) return null;

  const chain = maker(e);

  // 能力降级：没有 tapClip 不发 controller.tap（fallback 已在 controller 内）
  // 这里只做记录，不修改 chain（M0 暂时不用）

  return chain;
}

/** M1/M2 扩展点：查表式 Resolver，和 action table 同结构可扩展 */
export interface InteractionHook {
  match: (e: InteractionEvent, ctx: ResolverContext) => boolean;
  resolve: (e: InteractionEvent, ctx: ResolverContext) => ActionChain | null;
}
