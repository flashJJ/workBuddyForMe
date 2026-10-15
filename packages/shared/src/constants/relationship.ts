/**
 * v2.0 关系等级数值契约（M0 冻结稿，见 docs/plan/v2.0/03）。
 *
 * 等级是 v1.6 intimacy/trust 慢变量之上的派生展示层，全部调校只允许改本文件
 * 具名常量（沿用 v1.6 emotion.ts 纪律）；真机一轮后允许整体重标定，须同步本文件
 * 与契约文档。函数形状（relationship-kernel）M1 起冻结。
 */

// ── 等级结构 ────────────────────────────────────────────
/** 最高等级值（陌生 0 / 认识 1 / 搭档 2 / 挚友 3） */
export const RELATIONSHIP_LEVEL_MAX = 3;

/** 复合分加权：亲密度主导陪伴体感，信任设独立门槛防刷 */
export const RELATIONSHIP_INTIMACY_WEIGHT = 0.6;
export const RELATIONSHIP_TRUST_WEIGHT = 0.4;

/** 认识（1）与搭档（2）的复合分阈值 */
export const RELATIONSHIP_SCORE_ACQUAINTED = 25;
export const RELATIONSHIP_SCORE_PARTNER = 50;
/** 挚友（3）双门槛：复合分 + trust 硬下限（只刷 praise 的亲密度到不了顶） */
export const RELATIONSHIP_SCORE_CONFIDANT = 75;
export const RELATIONSHIP_CONFIDANT_TRUST_MIN = 60;

// ── 防刷：每助手每自然日正向增量上限（负向事件不受限） ──
export const RELATIONSHIP_DAILY_INTIMACY_CAP = 6;
export const RELATIONSHIP_DAILY_TRUST_CAP = 3;

// ── 回落保底（非实时、检查点制、永不清零） ──────────────
/** 连续零正向事件多少天后，每日检查点才允许评估地板降档 */
export const RELATIONSHIP_DECAY_GRACE_DAYS = 30;
/** 地板下限：等级永不低于「认识」 */
export const RELATIONSHIP_FLOOR_MIN = 1;
/** 降档后再升回该档需要超出阈值的迟滞分（防边界抖动） */
export const RELATIONSHIP_UPGRADE_HYSTERESIS = 5;

/** 本地日期键格式（IANA 时区由调用方按 v1.7 设置换算后传入，kernel 不碰时钟） */
export type RelationshipDayKey = string; // YYYY-MM-DD

// ── 里程碑（M2；docs/plan/v2.0/05 §2.1：定义在代码，表只存达成记录，首版 6 个） ──

export type RelationshipMilestoneKind = 'day' | 'collab';

export interface RelationshipMilestoneDef {
  /** 冻结 key：day_1/day_30/day_100/day_365/collab_10/collab_50 */
  key: string;
  kind: RelationshipMilestoneKind;
  /** day 类：第 N 个自然日（首次正向互动当日=第 1 天，自然日差 ≥ N-1 时达成） */
  day?: number;
  /** collab 类：该助手 done 的协作运行累计次数阈值 */
  collab?: number;
  /** 达成时触发的内置纪念剧本 id（复用 v1.7 引擎；成就本身即闸门，无等级门） */
  sceneId: string;
}

/**
 * 首日/30/100/365 天 + 协作 10/50 次（05 §2.1 冻结口径）。
 * 首日从 emotion_events 最早一条正向事件推算；协作数只读统计 agent_runs done。
 * first_kb（全局里程碑）按 05 保守口径不进首版。
 */
export const RELATIONSHIP_MILESTONES: readonly RelationshipMilestoneDef[] = [
  { key: 'day_1', kind: 'day', day: 1, sceneId: 'ev.milestone.day1' },
  { key: 'day_30', kind: 'day', day: 30, sceneId: 'ev.milestone.day30' },
  { key: 'day_100', kind: 'day', day: 100, sceneId: 'ev.milestone.day100' },
  { key: 'day_365', kind: 'day', day: 365, sceneId: 'ev.milestone.day365' },
  { key: 'collab_10', kind: 'collab', collab: 10, sceneId: 'ev.milestone.collab10' },
  { key: 'collab_50', kind: 'collab', collab: 50, sceneId: 'ev.milestone.collab50' },
];
