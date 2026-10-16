/**
 * v2.0 M3 主动感知 2.0：上下文触发器纯逻辑（封闭枚举 + 阈值 + 边沿触发状态机）。
 *
 * 纪律（路线图 G3）：
 * - 上下文源代码内枚举封闭：时段（深夜）/连续工作时长/久未对话；不读窗口标题/屏幕/文档；
 * - 纯函数、零依赖、不触网；状态机只保存「边沿去重状态」，不保存任何原始信号流水；
 * - 产出物只有「该演哪个剧本」，频率/勿扰/总开关/出口/对话锁仍由 EventDirector 统一兜底。
 *
 * 调用方（web）每 60s tick 一次，时区/小时由调用方注入（与 event-usage 的上海口径一致）。
 */

/** 上下文触发器种类（封闭枚举；协作终态沿用 v1.7 taskRunSuccess/Failure 意图，不在此列） */
export const CONTEXT_TRIGGER_KINDS = ['timeOfDay', 'workStreak', 'longNoChat'] as const;
export type ContextTriggerKind = (typeof CONTEXT_TRIGGER_KINDS)[number];

/** 一天四个时段（纯本地小时判定；本版仅深夜档绑定剧本） */
export const TIME_OF_DAY_SLOTS = ['morning', 'noon', 'evening', 'lateNight'] as const;
export type TimeOfDaySlot = (typeof TIME_OF_DAY_SLOTS)[number];

/** 连续工作触发阈值：持续活跃满 90 分钟 */
export const WORK_STREAK_TRIGGER_MS = 90 * 60_000;
/** 连续工作断口：空闲超过 5 分钟视为本段工作结束，重新计时 */
export const WORK_STREAK_IDLE_GAP_MS = 5 * 60_000;
/** 久未对话阈值：距最后一条消息满 3 天 */
export const LONG_NO_CHAT_TRIGGER_MS = 3 * 24 * 3600_000;
/** 深夜档时段：23:00（含）至次日 5:00（不含） */
export const LATE_NIGHT_START_HOUR = 23;
export const LATE_NIGHT_END_HOUR = 5;

/** 上下文触发器 → 内置剧本绑定（注册表封闭，id 与 built-in-events-v3 一一对应） */
export const CONTEXT_SCENE_IDS = {
  workStreak: 'ev.context.workstreak',
  lateNight: 'ev.context.latenight',
  longNoChat: 'ev.context.longnochat',
} as const;

export interface ContextTriggerSpec {
  kind: ContextTriggerKind;
  /** 时段类触发器绑定的具体时段；工时/久未对话为 null */
  slot: TimeOfDaySlot | null;
  eventId: string;
}

/** 内置上下文触发器注册表（顺序即设置页展示顺序；协作终态不在此表） */
export const BUILT_IN_CONTEXT_TRIGGERS: readonly ContextTriggerSpec[] = [
  { kind: 'timeOfDay', slot: 'lateNight', eventId: CONTEXT_SCENE_IDS.lateNight },
  { kind: 'workStreak', slot: null, eventId: CONTEXT_SCENE_IDS.workStreak },
  { kind: 'longNoChat', slot: null, eventId: CONTEXT_SCENE_IDS.longNoChat },
];

/** 小时 → 时段：morning [5,11) / noon [11,14) / evening [14,23) / lateNight [23,5) */
export function timeOfDaySlot(hour: number): TimeOfDaySlot {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 23) return 'evening';
  return 'lateNight';
}

export function isLateNightHour(hour: number): boolean {
  return hour >= LATE_NIGHT_START_HOUR || hour < LATE_NIGHT_END_HOUR;
}

/** 连续工作的边沿去重状态：null=当前不在工作段 */
export interface WorkStreakState {
  /** 本段连续工作起点（ms） */
  startedAt: number;
  /** 本段已触发时刻（ms）；null=尚未触发，满阈值后只触发一次 */
  firedAt: number | null;
}

/** 深夜关怀去重：记录已关怀过的夜晚归属键（跨日仅一次） */
export interface LateNightState {
  firedNightKey: string;
}

/** 久未对话去重：记录上次触发时锚定的最后消息时刻；消息更新即重新武装 */
export interface LongNoChatState {
  firedAnchorAt: number;
}

/** 上下文触发器持久状态（全部为派生边沿状态，非原始信号） */
export interface ContextAwarenessState {
  workStreak: WorkStreakState | null;
  lateNight: LateNightState | null;
  longNoChat: LongNoChatState | null;
}

export function createInitialContextState(): ContextAwarenessState {
  return { workStreak: null, lateNight: null, longNoChat: null };
}

/** 单次 tick 的信号输入（调用方按本地时区算好 hour/nightKey） */
export interface ContextTickInput {
  now: number;
  /** 本地小时 0–23 */
  hour: number;
  /**
   * 夜晚归属键（如 2026-10-20 的 23 点与 2026-10-21 的 0–4 点同键）。
   * 非深夜 tick 可传任意字符串（不参与判定）。
   */
  nightKey: string;
  /** 当下是否活跃：系统空闲/应用内活动是否在断口阈值内 */
  activeNow: boolean;
  /** 全助手最后一条消息时刻（ms）；无消息给 null */
  lastChatAt: number | null;
}

export interface ContextTickFire {
  kind: ContextTriggerKind;
  eventId: string;
}

export interface ContextTickResult {
  state: ContextAwarenessState;
  fires: ContextTickFire[];
}

/**
 * 上下文触发状态机归约（纯函数）：
 * - workStreak：活跃则续段/起段，满 90min 且本段未触发过 → 触发；不活跃立即断段；
 * - lateNight：活跃且处于深夜档，同一夜晚键只触发一次；
 * - longNoChat：活跃且距最后消息 ≥3 天，对同一段「无对话间隔」只触发一次，
 *   新消息（lastChatAt 前进）后自动重新武装。
 */
export function reduceContextTick(
  prev: ContextAwarenessState,
  input: ContextTickInput,
): ContextTickResult {
  const fires: ContextTickFire[] = [];

  // ── 连续工作时长 ──
  let workStreak = prev.workStreak;
  if (!input.activeNow) {
    workStreak = null;
  } else {
    const streak = workStreak ?? { startedAt: input.now, firedAt: null };
    if (streak.firedAt === null && input.now - streak.startedAt >= WORK_STREAK_TRIGGER_MS) {
      streak.firedAt = input.now;
      fires.push({ kind: 'workStreak', eventId: CONTEXT_SCENE_IDS.workStreak });
    }
    workStreak = streak;
  }

  // ── 深夜仍活跃（跨日仅一次；人不在跟前不演） ──
  let lateNight = prev.lateNight;
  if (input.activeNow && isLateNightHour(input.hour)) {
    if (lateNight?.firedNightKey !== input.nightKey) {
      lateNight = { firedNightKey: input.nightKey };
      fires.push({ kind: 'timeOfDay', eventId: CONTEXT_SCENE_IDS.lateNight });
    }
  }

  // ── 久未对话（以最后消息时刻为锚，同一段间隔不重复；无消息历史不触发） ──
  let longNoChat = prev.longNoChat;
  if (
    input.activeNow &&
    input.lastChatAt !== null &&
    input.now - input.lastChatAt >= LONG_NO_CHAT_TRIGGER_MS
  ) {
    if (longNoChat?.firedAnchorAt !== input.lastChatAt) {
      longNoChat = { firedAnchorAt: input.lastChatAt };
      fires.push({ kind: 'longNoChat', eventId: CONTEXT_SCENE_IDS.longNoChat });
    }
  }

  return { state: { workStreak, lateNight, longNoChat }, fires };
}
