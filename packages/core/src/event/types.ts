/**
 * v1.7 事件引擎运行时接口（core 内部，纯 TS，无 React/DOM）。
 *
 * 引擎只产出 effect 指令，由 M2 web EventPlayer 实现 EffectSink；
 * 时间/锁/用量全部依赖注入，单测用 ManualClock + 假 sink/gates。
 */
import type {
  EventDefinition,
  EventEndReason,
  EventFxId,
  EventMotionGroup,
  EventRunOutcome,
  EventSpatialAction,
  ExpressionTag,
} from '@wbfm/shared/schemas';

/** v1.7 首版人格权重（0..1），存 assistants 行，随 branch 条件读取 */
export interface PersonalityWeights {
  frankness: number;
  tsundere: number;
  shy: number;
  tolerance: number;
}

/** branch 条件求值上下文（触发/开演时快照） */
export interface ConditionContext {
  mood: { happiness: number; anger: number; sadness: number };
  relation: { intimacy: number; trust: number };
  /**
   * v2.0 关系等级快照：displayLevelOf(block, relation)。
   * 功能关闭/无状态时给 0（带等级闸门的剧本一律不放行）。
   */
  relationship: { level: number };
  personality: PersonalityWeights;
  /** emotionState.counters 命名计数器（含临时上下文如 reunionTier） */
  counters: Record<string, number>;
  time: { hour: number; lastInteractionMin: number };
}

/**
 * 演出 effect 出口（M2 映射到 Live2dController / TTS 队列 / pet 桥）。
 * 除 speech/release 外全部同步即发；spatial 在主窗实现为 no-op。
 */
export interface EventEffectSink {
  expression(tag: ExpressionTag, durationMs?: number): void;
  motion(group: EventMotionGroup): void;
  gaze(x: number, y: number): void;
  fx(id: EventFxId): void;
  spatial(action: EventSpatialAction): void;
  /**
   * 呈现台词：气泡字幕必有；speak=true 且播放器具备 TTS 时出声。
   * 播报完成（或气泡最短展示）后 resolve；signal abort 时播放器应立即中止并 resolve
   * （引擎另以信号竞赛兜底，sink 不应长时间挂住）。
   */
  speech(lineKey: string, speak: boolean, signal: AbortSignal): Promise<void>;
  /** 终态统一释放：视线回指针跟随、表情交还情绪基线、口型归零、桌宠 idle */
  release(): void;
}

/** 锁谓词（全部从现有运行时状态派生，引擎不持有锁事实源） */
export interface EventRunGates {
  /** 正常对话/主动搭话轮次进行中（CONV 锁，最高优先级） */
  isConvLocked(): boolean;
  /** 单 AudioContext 播放队列正在出声（TTS 锁） */
  isTtsLocked(): boolean;
  /** 主窗或桌宠任一可见（无窗不演，走通知兜底） */
  hasOutlet(): boolean;
}

/** 冷却/每日闸门的只读查询（M1 内存实现，M4 接 event_usage 仓储） */
export interface EventUsageReader {
  /** 同 eventId 最近一次 played 的毫秒时间戳；无则 null */
  lastPlayedAt(eventId: string): number | null;
  /** 指定本地日该 eventId 的 played 次数 */
  countPlayedToday(eventId: string, dateKey: string): number;
}

/** 用量记录（played/skipped/interrupted 落流水；suppressed 由 director 决定是否写） */
export interface EventUsageWriter {
  record(entry: {
    eventId: string;
    playedAt: number;
    outcome: EventRunOutcome;
    reason?: string;
    priority: number;
  }): void;
}

/** 演出终态结果（runner → director） */
export interface EventRunResult {
  eventId: string;
  outcome: Extract<EventRunOutcome, 'played' | 'skipped' | 'interrupted'>;
  reason?: EventEndReason;
  startedAt: number;
  endedAt: number;
  /** 实际执行的非 branch 指令条数（统计用） */
  effectsFired: number;
}

/** 队列项：剧本 + 触发时上下文快照（临时计数器随触发携带） */
export interface QueuedEvent {
  def: EventDefinition;
  context: ConditionContext;
  queuedAt: number;
}
