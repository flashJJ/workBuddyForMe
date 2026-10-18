/**
 * v2.3：交互动画图——把「触发键 → 动作链」从硬编码查表升级为数据配置。
 *
 * 一条目 = 触发键 + 可选条件（关系等级门槛 / 情绪档位 / 时段）+ **动作条目 id**。
 * 动作条目目录见 interaction-chains（内容仍是代码，条目只引用 id）——整张图可 JSON 化。
 *
 * 触发键口径（v2.3 P2-2 起覆盖全事件类型）：`touch::<region>::<gesture>` /
 * `context::<trigger>` / `system::<signal>` / `relationship::<up|down>`。
 *
 * 解析顺序（同键内）：按情绪档位兼容顺序（精确 → 更差 → 更好）取第一个
 * 「过关系门槛且时段命中」的条目，末位以「无档位条件」的条目兜底；
 * 全不中返回 null —— 保持「查不到返回空」的既有语义。
 *
 * shared 包严格 ≤240 行。
 */

import { type ActionChainId } from './interaction-chains';
import {
  CONTEXT_TRIGGERS,
  RELATIONSHIP_DIRECTIONS,
  SYSTEM_SIGNALS,
  TOUCH_GESTURES,
  TOUCH_REGIONS,
  touchTriggerKey,
  type InteractionEvent,
} from './interaction-events';
import type { MotionMood } from './motion-asset';
import { moodFallbackOrder } from './motion-selection';
import { levelAtLeast, type RelationshipLevel } from './relationship-level';

/**
 * 事件 → 触发键（全类型统一口径，v2.3 P2-2）。
 * 关系事件按方向建键（delta 为 0 不建键）；对话事件本版不接（返回 null）。
 */
export function eventTriggerKey(event: InteractionEvent): string | null {
  switch (event.kind) {
    case 'touch':
      return touchTriggerKey(event.region, event.gesture);
    case 'context':
      return `context::${event.trigger}`;
    case 'system':
      return `system::${event.signal}`;
    case 'relationship':
      if (event.delta > 0) return 'relationship::up';
      if (event.delta < 0) return 'relationship::down';
      return null;
    case 'chat':
      return null;
  }
}

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

/** 一条动画图条目：触发键 + 条件 + 动作条目 id（见 ACTION_CHAINS） */
export interface InteractionGraphEntry {
  /** 条目 id：内置条目必有（供「停用」配置引用）；用户覆盖条目不参与停用 */
  id?: string;
  /** 触发键（见 eventTriggerKey / touchTriggerKey） */
  key: string;
  condition?: InteractionGraphCondition;
  /** 动作条目 id（内置目录内） */
  chainId: ActionChainId;
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

/** 合法触发键集合（区域 × 手势 + 感知 / 系统信号 / 关系方向）——配置校验用 */
const TOUCH_TRIGGER_KEYS = TOUCH_REGIONS.flatMap((region) =>
  TOUCH_GESTURES.map((gesture) => touchTriggerKey(region, gesture)),
);
const CONTEXT_TRIGGER_KEYS = CONTEXT_TRIGGERS.map((trigger) => `context::${trigger}`);
const SYSTEM_TRIGGER_KEYS = SYSTEM_SIGNALS.map((signal) => `system::${signal}`);
const RELATIONSHIP_TRIGGER_KEYS = RELATIONSHIP_DIRECTIONS.map((direction) => `relationship::${direction}`);

const VALID_TRIGGER_KEYS: ReadonlySet<string> = new Set([
  ...TOUCH_TRIGGER_KEYS,
  ...CONTEXT_TRIGGER_KEYS,
  ...SYSTEM_TRIGGER_KEYS,
  ...RELATIONSHIP_TRIGGER_KEYS,
]);

/** 触发键是否合法 */
export function isValidTriggerKey(key: string): boolean {
  return VALID_TRIGGER_KEYS.has(key);
}

/** 触发键分组（UI 下拉用；分组标签走 i18n，键本身保持技术值） */
export const TRIGGER_KEY_GROUPS: ReadonlyArray<{ id: string; keys: readonly string[] }> = [
  { id: 'touch', keys: TOUCH_TRIGGER_KEYS },
  { id: 'context', keys: CONTEXT_TRIGGER_KEYS },
  { id: 'system', keys: SYSTEM_TRIGGER_KEYS },
  { id: 'relationship', keys: RELATIONSHIP_TRIGGER_KEYS },
];

/**
 * 内置默认动画图（触摸键与 v2.2 硬编码表逐条等价；id 供停用配置引用）。
 *
 * 非触摸键只给 4 个「可感知且不吵」的场景配默认表现，其余刻意留空：
 * - `context::lateNight`：射程落在默认勿扰时段内（23:00–06:00），被门控挡住，配了也不生效；
 * - `system::voice-end`：每念完一句都触发，默认给动作会变成噪音；
 * - `system::voice-start`：说话期已有说话表情与口型，再叠动作会打架；
 * - `system::idle` / `system::locked`：发生时用户看不见屏幕，加默认表现没有观感收益；
 * - `relationship::down`：关系契约明确「降级不推送、不制造愧疚」，不给默认表现。
 */
export const DEFAULT_INTERACTION_GRAPH: readonly InteractionGraphEntry[] = [
  { id: 'builtin:head-tap', key: 'touch::head::tap', chainId: 'head-tap' },
  // 陌生人：不让长按（害羞链太亲密）
  {
    id: 'builtin:head-longpress',
    key: 'touch::head::longpress',
    condition: { minLevel: 'acquaintance' },
    chainId: 'head-longpress',
  },
  { id: 'builtin:body-tap', key: 'touch::body::tap', chainId: 'body-tap' },
  { id: 'builtin:body-longpress', key: 'touch::body::longpress', chainId: 'body-longpress' },
  // 提起需要搭档以上
  {
    id: 'builtin:raised-tap',
    key: 'touch::raised::tap',
    condition: { minLevel: 'partner' },
    chainId: 'raised-tap',
  },
  { id: 'builtin:body-double', key: 'touch::body::double', chainId: 'body-double' },
  // 非触摸：久未对话 / 连续工作 → 抬头看一眼；回来 / 关系升级 → 高兴一下
  { id: 'builtin:context-longnochat', key: 'context::longNoChat', chainId: 'notice' },
  { id: 'builtin:context-workstreak', key: 'context::workStreak', chainId: 'notice' },
  { id: 'builtin:system-wake', key: 'system::wake', chainId: 'cheer' },
  { id: 'builtin:relationship-up', key: 'relationship::up', chainId: 'cheer' },
];

/** 内置条目 id 集合（「停用」配置的合法值域；手改 settings_kv 的未知 id 由服务端丢弃） */
const BUILTIN_ENTRY_IDS: ReadonlySet<string> = new Set(
  DEFAULT_INTERACTION_GRAPH.map((entry) => entry.id).filter((id): id is string => Boolean(id)),
);

/** 该 id 是否对应一个内置条目 */
export function isBuiltinEntryId(id: string): boolean {
  return BUILTIN_ENTRY_IDS.has(id);
}

/**
 * 装配最终动画图：用户覆盖条目**排在内置图之前**（覆盖优先生效），
 * 内置图中被「停用」的条目剔除；两者都没有时直接复用内置图（保持引用相等）。
 *
 * 注意语义：停用某触发键的**全部**条目后，该键匹配为空 —— 即「查不到返回空」，
 * 该交互不再有任何动作（这正是「停用」的预期）。
 */
export function buildInteractionGraph(
  overrides?: readonly InteractionGraphEntry[] | null,
  disabledEntryIds?: readonly string[] | null,
): readonly InteractionGraphEntry[] {
  const hasOverrides = Boolean(overrides && overrides.length > 0);
  const hasDisabled = Boolean(disabledEntryIds && disabledEntryIds.length > 0);
  if (!hasOverrides && !hasDisabled) return DEFAULT_INTERACTION_GRAPH;

  const disabled = new Set(disabledEntryIds ?? []);
  const builtins = hasDisabled
    ? DEFAULT_INTERACTION_GRAPH.filter((entry) => !entry.id || !disabled.has(entry.id))
    : DEFAULT_INTERACTION_GRAPH;
  return hasOverrides ? [...overrides!, ...builtins] : builtins;
}
