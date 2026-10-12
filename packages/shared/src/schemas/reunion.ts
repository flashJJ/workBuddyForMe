/**
 * v1.6 M5 久别迎接判定（G6）：纯函数、可注入时钟与随机数。
 *
 * 设计原则：
 * - 零模型调用：命中后由渲染层从本地短句池取一句话 + 表情闪现；
 * - 每波久别只迎接一次：以 lastInteractionAt 为「久别基线」，
 *   迎接过后记录该基线；只有用户产生了新的交互（基线前移）才可能再迎接，
 *   避免冷却到期后对同一段缺席反复打招呼；
 * - 新装/无历史不迎接（首启向导负责第一次欢迎）。
 */
import {
  REUNION_LONG_MISS_LINE_COUNT,
  REUNION_LONG_MISS_MS,
  REUNION_MISS_LINE_COUNT,
  REUNION_MISS_MS,
  REUNION_WELCOME_LINE_COUNT,
  REUNION_WELCOME_MS,
} from '../constants/reunion';
import type { ExpressionTag } from './expression';

export type ReunionTier = 'welcome' | 'miss' | 'longMiss';

export interface ReunionInput {
  /** 最近一次真实交互时刻（全助手最后一条消息，ms）；null=从未有过对话 */
  lastInteractionAt: number | null;
  /** 上一次迎接所针对的交互基线（ms）；null=从未迎接过 */
  lastGreetedInteractionAt: number | null;
  now: number;
}

export interface ReunionDecision {
  greet: boolean;
  tier: ReunionTier | null;
  /** 距上次交互的毫秒数（无历史为 null），供观测/测试 */
  elapsedMs: number | null;
}

/** 各档对应的表情：迎接用 joy；想念档用 sadness 表达轻度委屈（不用 anger） */
export const REUNION_TIER_EXPRESSION = {
  welcome: 'joy',
  miss: 'sadness',
  longMiss: 'sadness',
} as const satisfies Record<ReunionTier, ExpressionTag>;

export function decideReunion(input: ReunionInput): ReunionDecision {
  const { lastInteractionAt, lastGreetedInteractionAt, now } = input;
  if (lastInteractionAt === null) {
    return { greet: false, tier: null, elapsedMs: null };
  }
  const elapsedMs = now - lastInteractionAt;
  if (elapsedMs < REUNION_WELCOME_MS) {
    return { greet: false, tier: null, elapsedMs };
  }
  // 这波久别已经迎接过（迎接后用户尚未产生新交互）：不重复
  if (lastGreetedInteractionAt !== null && lastGreetedInteractionAt >= lastInteractionAt) {
    return { greet: false, tier: null, elapsedMs };
  }
  const tier: ReunionTier =
    elapsedMs >= REUNION_LONG_MISS_MS
      ? 'longMiss'
      : elapsedMs >= REUNION_MISS_MS
        ? 'miss'
        : 'welcome';
  return { greet: true, tier, elapsedMs };
}

/**
 * 按档与随机数选一条本地迎接短句的 i18n 键。
 * @param random 0..1
 */
export function pickReunionLineKey(tier: ReunionTier, random: number): string {
  const count =
    tier === 'welcome'
      ? REUNION_WELCOME_LINE_COUNT
      : tier === 'miss'
        ? REUNION_MISS_LINE_COUNT
        : REUNION_LONG_MISS_LINE_COUNT;
  const index = Math.min(count - 1, Math.floor(random * count));
  return `emotion.reunion.${tier}${index}`;
}

/** localStorage 持久化的迎接去重状态（JSON） */
export interface ReunionMemory {
  /** 已迎接过的交互基线 ms */
  greetedInteractionAt: number;
  /** 迎接发生时刻 ms（观测用） */
  greetedAt: number;
}
