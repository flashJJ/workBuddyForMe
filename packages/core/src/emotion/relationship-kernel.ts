/**
 * v2.0 关系等级内核纯函数（M0 冻结，见 docs/plan/v2.0/03）。
 *
 * 与 DB/React/时钟无关：dayKey（YYYY-MM-DD，IANA 换算由调用方完成）全部注入。
 * 等级 = intimacy/trust 复合分的派生展示层 + 慢速地板；本文件只演算不持久化，
 * M1 由 emotion service 在既有 recordEmotion 路径后串联 applyRelationshipEvent。
 */
import {
  RELATIONSHIP_CONFIDANT_TRUST_MIN,
  RELATIONSHIP_DAILY_INTIMACY_CAP,
  RELATIONSHIP_DAILY_TRUST_CAP,
  RELATIONSHIP_DECAY_GRACE_DAYS,
  RELATIONSHIP_FLOOR_MIN,
  RELATIONSHIP_INTIMACY_WEIGHT,
  RELATIONSHIP_LEVEL_MAX,
  RELATIONSHIP_SCORE_ACQUAINTED,
  RELATIONSHIP_SCORE_CONFIDANT,
  RELATIONSHIP_SCORE_PARTNER,
  RELATIONSHIP_TRUST_WEIGHT,
  RELATIONSHIP_UPGRADE_HYSTERESIS,
} from '@wbfm/shared/constants';
import type {
  RelationshipBlock,
  RelationshipDailyGain,
  RelationshipLevelEvent,
  RelationshipLevelValue,
} from '@wbfm/shared/schemas';

export interface RelationScores {
  intimacy: number;
  trust: number;
}

export interface RelationshipEventResult {
  block: RelationshipBlock;
  relation: RelationScores;
  /** 本次真正施加的增量（受日上限截断后；负向不截） */
  granted: RelationScores;
  levelChanged: boolean;
  events: RelationshipLevelEvent[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function daysBetween(fromDay: string, toDay: string): number {
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(`${toDay}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/** v1 状态（无关系块）读侧补的默认块；新助手首条事件前也用它 */
export function defaultRelationshipBlock(): RelationshipBlock {
  return {
    levelFloor: 0,
    highestLevelEver: 0,
    lastPositiveDay: null,
    lastFloorDownAt: null,
    dailyGain: { dayKey: '', intimacy: 0, trust: 0 },
  };
}

/** 复合分 = 0.6×亲密 + 0.4×信任（0–100） */
export function levelScoreOf(relation: RelationScores): number {
  return round1(
    clamp(
      RELATIONSHIP_INTIMACY_WEIGHT * relation.intimacy +
        RELATIONSHIP_TRUST_WEIGHT * relation.trust,
      0,
      100,
    ),
  );
}

/**
 * 实时分数等级（不含地板/迟滞）。
 * 挚友双门槛：复合分 ≥75 且 trust ≥60。
 */
export function levelFromScore(score: number, trust: number): RelationshipLevelValue {
  if (score >= RELATIONSHIP_SCORE_CONFIDANT && trust >= RELATIONSHIP_CONFIDANT_TRUST_MIN) {
    return 3;
  }
  if (score >= RELATIONSHIP_SCORE_PARTNER) return 2;
  if (score >= RELATIONSHIP_SCORE_ACQUAINTED) return 1;
  return 0;
}

/**
 * 降后再升的实时等级：发生过地板降档且尚未重新升上去时，分数阈值加迟滞带，
 * trust 硬门槛不变。返回 null 表示无迟滞状态（调用方直接用 levelFromScore）。
 */
function levelFromScoreAfterDown(score: number, trust: number): RelationshipLevelValue {
  if (
    score >= RELATIONSHIP_SCORE_CONFIDANT + RELATIONSHIP_UPGRADE_HYSTERESIS &&
    trust >= RELATIONSHIP_CONFIDANT_TRUST_MIN
  ) {
    return 3;
  }
  if (score >= RELATIONSHIP_SCORE_PARTNER + RELATIONSHIP_UPGRADE_HYSTERESIS) return 2;
  if (score >= RELATIONSHIP_SCORE_ACQUAINTED + RELATIONSHIP_UPGRADE_HYSTERESIS) return 1;
  return 0;
}

/** 展示等级 = max(地板, 迟滞后的实时等级) */
export function displayLevelOf(
  block: RelationshipBlock,
  relation: RelationScores,
): RelationshipLevelValue {
  const score = levelScoreOf(relation);
  const live =
    block.lastFloorDownAt !== null
      ? levelFromScoreAfterDown(score, relation.trust)
      : levelFromScore(score, relation.trust);
  return Math.max(block.levelFloor, live) as RelationshipLevelValue;
}

/** 解锁闸门：展示等级达到 minLevel */
export function isRelationshipUnlocked(
  block: RelationshipBlock,
  relation: RelationScores,
  minLevel: RelationshipLevelValue,
): boolean {
  return displayLevelOf(block, relation) >= minLevel;
}

function rollover(dailyGain: RelationshipDailyGain, dayKey: string): RelationshipDailyGain {
  return dailyGain.dayKey === dayKey
    ? dailyGain
    : { dayKey, intimacy: 0, trust: 0 };
}

function capPositive(delta: number, used: number, cap: number): number {
  if (delta <= 0) return delta; // 负向（belittle）不拦截
  return Math.min(delta, Math.max(0, cap - used));
}

/**
 * 施加一次关系增量（由调用方从 EMOTION_EVENT_DELTAS 的 intimacy/trust 分量传入）。
 * - 跨天自动 rollover 日增量；
 * - 正向分量受日上限截断（事件仍由调用方写流水，本函数只演算数值）；
 * - 实时越阈即升级并抬地板（降后再升吃 +5 迟滞），升级后清除降档标记；
 * - 有正向分量时刷新 lastPositiveDay。
 */
export function applyRelationshipEvent(
  prevBlock: RelationshipBlock,
  prevRelation: RelationScores,
  delta: RelationScores,
  dayKey: string,
): RelationshipEventResult {
  const block: RelationshipBlock = structuredClone(prevBlock);
  block.dailyGain = rollover(block.dailyGain, dayKey);

  const grantedIntimacy = capPositive(
    delta.intimacy,
    block.dailyGain.intimacy,
    RELATIONSHIP_DAILY_INTIMACY_CAP,
  );
  const grantedTrust = capPositive(
    delta.trust,
    block.dailyGain.trust,
    RELATIONSHIP_DAILY_TRUST_CAP,
  );

  if (grantedIntimacy > 0) block.dailyGain.intimacy += grantedIntimacy;
  if (grantedTrust > 0) block.dailyGain.trust += grantedTrust;
  if (delta.intimacy > 0 || delta.trust > 0) block.lastPositiveDay = dayKey;

  const relation: RelationScores = {
    intimacy: round1(clamp(prevRelation.intimacy + grantedIntimacy, 0, 100)),
    trust: round1(clamp(prevRelation.trust + grantedTrust, 0, 100)),
  };

  const before = displayLevelOf(prevBlock, prevRelation);
  // 升过被降档位后解除迟滞（实时等级已回到地板之上）
  const score = levelScoreOf(relation);
  const liveAfterDown = levelFromScoreAfterDown(score, relation.trust);
  if (block.lastFloorDownAt !== null && liveAfterDown > block.levelFloor) {
    block.lastFloorDownAt = null;
  }
  const live =
    block.lastFloorDownAt === null
      ? levelFromScore(score, relation.trust)
      : liveAfterDown;

  const events: RelationshipLevelEvent[] = [];
  if (live > block.levelFloor) {
    events.push({ type: 'level_up', from: block.levelFloor, to: live });
    block.levelFloor = live;
    block.highestLevelEver = Math.max(
      block.highestLevelEver,
      live,
    ) as RelationshipLevelValue;
  }
  const after = displayLevelOf(block, relation);
  if (events.length > 0 && after === before) events.length = 0; // 理论不可达保险

  return {
    block,
    relation,
    granted: { intimacy: grantedIntimacy, trust: grantedTrust },
    levelChanged: events.length > 0,
    events,
  };
}

/**
 * 每日检查点评估地板降档（由 v1.7 scheduler tick 每日调用一次）：
 * - 连续 ≥30 天零正向事件；
 * - 距上次降档 ≥30 天（或从未降档）；
 * - 地板高于下限。
 * 三条全满足才降 1 档；任何一条不满足原样返回。
 */
export function evaluateFloorAtCheckpoint(
  prevBlock: RelationshipBlock,
  todayDayKey: string,
): { block: RelationshipBlock; event: RelationshipLevelEvent | null } {
  const block = structuredClone(prevBlock);
  const silentDays = block.lastPositiveDay
    ? daysBetween(block.lastPositiveDay, todayDayKey)
    : Infinity;
  const sinceLastDown = block.lastFloorDownAt
    ? daysBetween(block.lastFloorDownAt, todayDayKey)
    : Infinity;

  if (
    silentDays >= RELATIONSHIP_DECAY_GRACE_DAYS &&
    sinceLastDown >= RELATIONSHIP_DECAY_GRACE_DAYS &&
    block.levelFloor > RELATIONSHIP_FLOOR_MIN
  ) {
    const from = block.levelFloor;
    const to = (from - 1) as RelationshipLevelValue;
    block.levelFloor = to;
    block.lastFloorDownAt = todayDayKey;
    return { block, event: { type: 'level_down', from, to } };
  }
  return { block, event: null };
}

/** M1 接 shared zod：把任意输入宽容归一化为合法块（坏数据回落默认值，不抛错） */
export function normalizeRelationshipBlock(value: unknown): RelationshipBlock {
  const fallback = defaultRelationshipBlock();
  if (typeof value !== 'object' || value === null) return fallback;
  const src = value as Record<string, unknown>;
  const level = (v: unknown): RelationshipLevelValue =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= RELATIONSHIP_LEVEL_MAX
      ? (v as RelationshipLevelValue)
      : fallback.levelFloor;
  const day = (v: unknown): string | null =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const gainSrc =
    typeof src.dailyGain === 'object' && src.dailyGain !== null
      ? (src.dailyGain as Record<string, unknown>)
      : {};
  return {
    levelFloor: level(src.levelFloor),
    highestLevelEver: level(src.highestLevelEver),
    lastPositiveDay: day(src.lastPositiveDay),
    lastFloorDownAt: day(src.lastFloorDownAt),
    dailyGain: {
      dayKey: typeof gainSrc.dayKey === 'string' ? gainSrc.dayKey : '',
      intimacy:
        typeof gainSrc.intimacy === 'number' && gainSrc.intimacy >= 0
          ? gainSrc.intimacy
          : 0,
      trust:
        typeof gainSrc.trust === 'number' && gainSrc.trust >= 0
          ? gainSrc.trust
          : 0,
    },
  };
}
