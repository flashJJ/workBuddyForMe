import { z } from 'zod';
import {
  RELATIONSHIP_LEVEL_MAX,
  type RelationshipDayKey,
} from '../constants/relationship';

/**
 * v2.0 关系等级块（M0 冻结稿，见 docs/plan/v2.0/03 §5）。
 *
 * 挂在 assistant_emotion_states.state_json.relationship（schemaVersion 2）；
 * v1 行无此块，读侧补 defaultRelationshipBlock()。等级是 relation 分数的
 * 派生展示层 + 慢速地板，原始 intimacy/trust 仍由 v1.6 emotion 内核维护。
 */

/** 等级值：0 陌生 / 1 认识 / 2 搭档 / 3 挚友（名称走 i18n，不存枚举字符串） */
export const relationshipLevelSchema = z
  .number()
  .int()
  .min(0)
  .max(RELATIONSHIP_LEVEL_MAX);

export type RelationshipLevelValue = z.infer<typeof relationshipLevelSchema>;

const dayKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$|^$/, '日期键必须为 YYYY-MM-DD 或空串');

export const relationshipDailyGainSchema = z.object({
  dayKey: dayKeySchema,
  intimacy: z.number().min(0),
  trust: z.number().min(0),
});
export type RelationshipDailyGain = z.infer<typeof relationshipDailyGainSchema>;

export const relationshipBlockSchema = z.object({
  /** 当前等级地板（随升级抬升、检查点慢速下调，永不低于 RELATIONSHIP_FLOOR_MIN） */
  levelFloor: relationshipLevelSchema,
  /** 历史曾达最高等级（只升不降，永久保留） */
  highestLevelEver: relationshipLevelSchema,
  /** 最近一次有正向 soulEvent 的本地日期（IANA 换算后由调用方传入） */
  lastPositiveDay: z.string().nullable(),
  /** 最近一次地板降档日期（用于降档间隔与再升迟滞） */
  lastFloorDownAt: z.string().nullable(),
  /** 当日已施加的正向增量（跨天 rollover 清零） */
  dailyGain: relationshipDailyGainSchema,
});
export type RelationshipBlock = z.infer<typeof relationshipBlockSchema>;

/** 等级变迁事件（写 emotion_events，type=level_up/level_down，intensity=新等级） */
export const RELATIONSHIP_LEVEL_EVENT_TYPES = ['level_up', 'level_down'] as const;
export type RelationshipLevelEventType =
  (typeof RELATIONSHIP_LEVEL_EVENT_TYPES)[number];

export interface RelationshipLevelEvent {
  type: RelationshipLevelEventType;
  from: RelationshipLevelValue;
  to: RelationshipLevelValue;
}

/** 类型空检查用：保证 dayKey 形状被引用 */
export type { RelationshipDayKey };
