/**
 * v1.7 触发上下文快照组装（纯函数）。
 *
 * - mood/relation/counters 取自 v1.6 EmotionState（拉取失败给中性默认，不阻断触发）；
 * - personality 4 权重在 v024（M4）人格列落地前一律 0.5——剧本傲娇支线默认不进，
 *   迁移完成后由调用方传入真实权重，本函数签名不变；
 * - 触发器临时计数器（reunionTier/touchStreak/interactionsToday）由调用方合并。
 */
import type { EmotionState } from '@wbfm/shared/schemas';
import type { ConditionContext, PersonalityWeights } from '@wbfm/core/event-client';

/** v024 前的人格中性默认（不偏向任何支线） */
export const DEFAULT_PERSONALITY: PersonalityWeights = {
  frankness: 0.5,
  tsundere: 0.5,
  shy: 0.5,
  tolerance: 0.5,
};

export interface BuildContextArgs {
  emotion: EmotionState | null;
  now: number;
  /** 距上次用户交互分钟数（无记录给一个大值，使相关条件不成立的反方向由剧本控制） */
  lastInteractionMin: number | null;
  /** 触发时携带的临时/本地计数器（覆盖同名 emotion counters） */
  extraCounters?: Record<string, number>;
  personality?: PersonalityWeights;
}

export function buildConditionContext(args: BuildContextArgs): ConditionContext {
  const date = new Date(args.now);
  return {
    // 防御缺字段的旧/异常情绪快照（测试 fixture、损坏数据），逐级回落中性值
    mood: {
      happiness: args.emotion?.mood?.happiness ?? 0,
      anger: args.emotion?.mood?.anger ?? 0,
      sadness: args.emotion?.mood?.sadness ?? 0,
    },
    relation: {
      intimacy: args.emotion?.relation?.intimacy ?? 0,
      trust: args.emotion?.relation?.trust ?? 0,
    },
    personality: args.personality ?? DEFAULT_PERSONALITY,
    counters: {
      ...(args.emotion?.counters ?? {}),
      ...(args.extraCounters ?? {}),
    },
    time: {
      hour: date.getHours(),
      lastInteractionMin: args.lastInteractionMin ?? Number.MAX_SAFE_INTEGER / 60000,
    },
  };
}
