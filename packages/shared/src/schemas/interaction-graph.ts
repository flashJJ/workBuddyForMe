/**
 * v2.3 M1：交互动画图——把「区域::手势 → 动作链」从硬编码查表升级为数据配置。
 *
 * 一条目 = 触发键 + 可选条件（关系等级门槛 / 情绪档位 / 时段）+ 动作链。
 * 同一键可有多种状态条目，各自指名动作链；**动作链内容仍是代码**，条目只引用。
 *
 * 解析顺序（同键内）：按情绪档位兼容顺序（精确 → 更差 → 更好）取第一个
 * 「过关系门槛且时段命中」的条目，末位以「无档位条件」的条目兜底；
 * 全不中返回 null —— 保持「查不到返回空」的既有语义。
 *
 * shared 包严格 ≤240 行。
 */

import type { ActionChain } from './interaction-actions';
import type { TouchRegion } from './interaction-events';
import type { MotionMood } from './motion-asset';
import { moodFallbackOrder } from './motion-selection';
import { levelAtLeast, type RelationshipLevel } from './relationship-level';

/** 当前小时是否落在 [startHour, endHour) 窗口内（支持跨零点；起止相同 = 空窗口） */
export function isHourInWindow(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

/** 动画图条目的条件（各维度均可选：缺省 = 该维度不限制） */
export interface InteractionGraphCondition {
  /** 关系等级门槛（硬门槛：不够则该条目不可用） */
  minLevel?: RelationshipLevel;
  /** 情绪档位（缺省 = 任意档位；同档位精确优先，其次按兼容顺序回退） */
  mood?: MotionMood;
  /** 时段（跨零点窗口，含起、不含止） */
  hours?: { startHour: number; endHour: number };
}

/** 一条动画图条目：触发键 + 条件 + 动作链工厂（每次调用产出新的 ActionChain） */
export interface InteractionGraphEntry {
  /** 触发键 `touch::<region>::<gesture>`（见 touchTriggerKey） */
  key: string;
  condition?: InteractionGraphCondition;
  chain: () => ActionChain;
}

/** 匹配上下文：当前关系等级 + 情绪档位 + 小时 */
export interface InteractionGraphContext {
  relationshipLevel: RelationshipLevel;
  mood: MotionMood;
  hour: number;
}

function conditionMatches(entry: InteractionGraphEntry, ctx: InteractionGraphContext): boolean {
  const condition = entry.condition;
  if (!condition) return true;
  if (condition.minLevel && !levelAtLeast(ctx.relationshipLevel, condition.minLevel)) return false;
  if (
    condition.hours &&
    !isHourInWindow(ctx.hour, condition.hours.startHour, condition.hours.endHour)
  ) {
    return false;
  }
  return true;
}

/** 按触发键 + 状态挑条目的纯函数；全不中返回 null */
export function resolveInteractionEntry(
  entries: readonly InteractionGraphEntry[],
  key: string,
  ctx: InteractionGraphContext,
): InteractionGraphEntry | null {
  const sameKey = entries.filter((entry) => entry.key === key);
  if (sameKey.length === 0) return null;

  for (const mood of moodFallbackOrder(ctx.mood)) {
    const hit = sameKey.find(
      (entry) => entry.condition?.mood === mood && conditionMatches(entry, ctx),
    );
    if (hit) return hit;
  }
  // 无档位条件的条目（任意档位）兜底
  return (
    sameKey.find((entry) => entry.condition?.mood === undefined && conditionMatches(entry, ctx)) ??
    null
  );
}

/** 冷却 per region（ms）：门控与条目 chain.cooldownMs 同源 */
export const DEFAULT_COOLDOWN = {
  head: 500,
  body: 800,
  raised: 1500,
  pinch: 2000,
  unknown: 800,
} as const satisfies Record<TouchRegion, number>;

/** 内置默认动画图（与 v2.2 的硬编码表逐条等价） */
export const DEFAULT_INTERACTION_GRAPH: readonly InteractionGraphEntry[] = [
  {
    key: 'touch::head::tap',
    chain: () => ({
      actions: [
        { type: 'interaction.start', kind: 'head-touch' },
        { type: 'controller.playSquash' },
        // 点击头部顺带随机播一个一次性动作（动作池为空时 controller 内部走程序化回退）
        { type: 'controller.tap' },
        { type: 'controller.flashExpression', tag: 'joy', durationMs: 2600 },
      ],
      priority: 'normal',
      cooldownMs: DEFAULT_COOLDOWN.head,
    }),
  },
  {
    key: 'touch::head::longpress',
    // 陌生人：不让长按（害羞链太亲密）
    condition: { minLevel: 'acquaintance' },
    chain: () => ({
      actions: [
        { type: 'interaction.start', kind: 'head-touch' },
        { type: 'controller.playSquash', scaleX: 1.06, scaleY: 0.96, durationMs: 400 },
        { type: 'controller.flashExpression', tag: 'surprise', durationMs: 4200 },
      ],
      priority: 'high',
      cooldownMs: DEFAULT_COOLDOWN.head * 2,
    }),
  },
  {
    // body 区域：微弹 + smirk + 俏皮短句（幅度减半，因为身体比头部「钝」）
    key: 'touch::body::tap',
    chain: () => ({
      actions: [
        { type: 'interaction.start', kind: 'body-touch' },
        { type: 'controller.playSquash', scaleX: 1.02, scaleY: 0.98, durationMs: 160 },
        { type: 'controller.tap' },
        { type: 'controller.flashExpression', tag: 'smirk', durationMs: 1800 },
      ],
      priority: 'normal',
      cooldownMs: DEFAULT_COOLDOWN.body,
    }),
  },
  {
    key: 'touch::body::longpress',
    chain: () => ({
      actions: [
        { type: 'interaction.start', kind: 'body-touch' },
        { type: 'controller.playSquash', scaleX: 1.03, scaleY: 0.97, durationMs: 200 },
        { type: 'controller.flashExpression', tag: 'joy', durationMs: 2400 },
      ],
      priority: 'normal',
      cooldownMs: DEFAULT_COOLDOWN.body * 2,
    }),
  },
  {
    // raised：提起小区域触发「被提起」动作（需要搭档以上）
    key: 'touch::raised::tap',
    condition: { minLevel: 'partner' },
    chain: () => ({
      actions: [
        { type: 'interaction.start', kind: 'raised' },
        { type: 'controller.playSquash', scaleX: 0.94, scaleY: 1.08, durationMs: 300 },
        { type: 'controller.flashExpression', tag: 'surprise', durationMs: 2000 },
      ],
      priority: 'high',
      cooldownMs: DEFAULT_COOLDOWN.raised,
    }),
  },
  {
    // body 双击：角色动作（与头部盒双击「回主窗」的窗口行为分开）
    // 双击必经单击，squash 包络若在此再触发会「重置回弹起点」造成抖动，故这里只加深反馈，不重复 squash
    key: 'touch::body::double',
    chain: () => ({
      actions: [
        { type: 'interaction.start', kind: 'body-touch' },
        { type: 'controller.setExpression', tag: 'smirk' },
        { type: 'controller.tap' },
        { type: 'controller.flashExpression', tag: 'joy', durationMs: 1400 },
      ],
      priority: 'normal',
      cooldownMs: DEFAULT_COOLDOWN.body * 2,
    }),
  },
];
