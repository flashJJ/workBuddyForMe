/**
 * v2.0 M3 主动感知 2.0：上下文触发的渲染端装配（纯函数 + 边沿状态持久化）。
 *
 * 与状态机（shared/context-triggers）的分工：本模块只负责
 * 上海口径小时/夜键、活跃判定（系统空闲优先、应用内活动回落）与 localStorage 持久化。
 * 持久化内容仅为边沿去重状态（工作段/夜键/无对话锚点），不保存任何原始信号流水。
 */
import {
  LATE_NIGHT_END_HOUR,
  WORK_STREAK_IDLE_GAP_MS,
  createInitialContextState,
  reduceContextTick,
  type ContextAwarenessState,
  type ContextTickResult,
} from '@wbfm/shared/events';
import { shanghaiDateKey } from './remote-usage-store';

const STATE_KEY = 'wbfm.context-awareness.v1';

function getStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 读取边沿状态（损坏/缺省回落初始态） */
export function loadContextState(): ContextAwarenessState {
  const store = getStore();
  if (!store) return createInitialContextState();
  try {
    const raw = store.getItem(STATE_KEY);
    if (!raw) return createInitialContextState();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return createInitialContextState();
    // 形状仅做最小校验：状态机对 null/异常字段有完整容忍
    return { ...createInitialContextState(), ...(parsed as Partial<ContextAwarenessState>) };
  } catch {
    return createInitialContextState();
  }
}

export function saveContextState(state: ContextAwarenessState): void {
  const store = getStore();
  if (!store) return;
  try {
    store.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* 隐私模式/存储满：本会话内 ref 仍去重 */
  }
}

/** 上海口径本地小时（UTC+8 无 DST） */
export function shanghaiHour(nowMs: number): number {
  return new Date(nowMs + 8 * 3600_000).getUTCHours();
}

/**
 * 夜晚归属键：0:00–4:59 归前一天，与前一晚 23 点同键；
 * 其余小时返回当日键（非深夜 tick 不消费该值）。
 */
export function shanghaiNightKey(nowMs: number): string {
  const hour = shanghaiHour(nowMs);
  return shanghaiDateKey(hour < LATE_NIGHT_END_HOUR ? nowMs - 24 * 3600_000 : nowMs);
}

export interface ActiveSignalInput {
  /** 系统事件授权是否开启（开启后空闲口径以系统级为准） */
  systemAware: boolean;
  /** 主进程最近一次空闲广播的秒数；桥未给样本时为 null */
  systemIdleSeconds: number | null;
  /** 应用内最近一次离散交互距当前分钟数；无记录为 null */
  appInteractionMin: number | null;
}

/**
 * 当下是否活跃（断口 < WORK_STREAK_IDLE_GAP_MS）：
 * 已授权且收到系统样本 → 系统空闲口径（切到别的应用工作也算）；
 * 未授权/桥缺失/启动空窗 → 应用内交互回落。
 */
export function isActiveNow(input: ActiveSignalInput): boolean {
  if (input.systemAware && input.systemIdleSeconds !== null) {
    return input.systemIdleSeconds * 1000 < WORK_STREAK_IDLE_GAP_MS;
  }
  return (
    input.appInteractionMin !== null &&
    input.appInteractionMin * 60_000 < WORK_STREAK_IDLE_GAP_MS
  );
}

export interface EvaluateArgs {
  state: ContextAwarenessState;
  now: number;
  activeNow: boolean;
  /** 全助手最后一条消息时刻（ms）；无消息为 null */
  lastChatAt: number | null;
}

/** 组装上海口径 tick 输入并归约（时区/持久化细节不外泄到 hook） */
export function evaluateContextTick(args: EvaluateArgs): ContextTickResult {
  return reduceContextTick(args.state, {
    now: args.now,
    hour: shanghaiHour(args.now),
    nightKey: shanghaiNightKey(args.now),
    activeNow: args.activeNow,
    lastChatAt: args.lastChatAt,
  });
}
