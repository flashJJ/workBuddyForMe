/**
 * v1.7 EventDirector：准入闸门、优先级打断、FIFO 队列、用量记录。
 *
 * 单当前演出 + 有界队列（≤4）。闸门顺序固定：
 * CONV 占用 → 总开关 → 出口 → 勿扰 → 冷却（频率档系数）→ 每日上限 → 当前占用仲裁。
 * 仅"真正尝试过"的拒绝记 suppressed；CONV 占用直接 blocked，不占冷却、不记流水。
 */
import {
  EVENT_QUEUE_LIMIT,
  type EventDefinition,
  type EventFrequencyTier,
  type EventSuppressReason,
} from '@wbfm/shared/schemas';
import type { EventRunGates, ConditionContext, QueuedEvent } from './types';
import type { EventEffectSink, EventUsageReader, EventUsageWriter } from './types';
import type { EventClock } from './clock';
import { EventRunner } from './runner';
import { effectiveCooldown, isQuietHour } from './gates';

/** 用量闸门：内存实现与 M4 远程快照写穿实现均满足该结构化类型 */
export type EventUsageStore = EventUsageReader & EventUsageWriter;

export interface DirectorSettings {
  masterEnabled: boolean;
  quietStart: number;
  quietEnd: number;
  tier: EventFrequencyTier;
}

export type TriggerDecision =
  | { kind: 'admitted'; runner: EventRunner }
  | { kind: 'queued'; position: number }
  | { kind: 'suppressed'; reason: EventSuppressReason }
  /** CONV 锁期间触发：不排队、不记流水（正常竞争，非打扰） */
  | { kind: 'blocked'; reason: 'conv_locked' };

export interface EventDirectorDeps {
  gates: EventRunGates;
  clock: EventClock;
  sink: EventEffectSink;
  usage: EventUsageStore;
  settings: DirectorSettings;
  /** 本地日界（与 usage store 同一口径） */
  toDateKey: (nowMs: number) => string;
  /** 测试注入：自定义 runner 构造 */
  runnerFactory?: (def: EventDefinition, ctx: ConditionContext) => EventRunner;
}

const DEFAULT_QUIET = { start: 23, end: 8 };

export class EventDirector {
  private current: { runner: EventRunner; def: EventDefinition } | null = null;
  private readonly queue: QueuedEvent[] = [];
  private settings: DirectorSettings;

  constructor(private readonly deps: EventDirectorDeps) {
    this.settings = deps.settings;
  }

  setSettings(patch: Partial<DirectorSettings>): void {
    this.settings = { ...this.settings, ...patch };
  }

  isBusy(): boolean {
    return this.current !== null;
  }

  /**
   * 用户跳过当前演出（Esc/点击跳过层）：无负面情绪，记 skipped。
   * 排队项保留（跳过不影响后续 FIFO）；无当前演出时 no-op。
   */
  skipCurrent(): void {
    this.current?.runner.skip();
  }

  queuedCount(): number {
    return this.queue.length;
  }

  /** CONV 开始（最高优先级）：打断当前、清空等待队列 */
  notifyConvStart(): void {
    for (const item of this.queue) {
      this.recordSuppress(item.def, 'conv_locked');
    }
    this.queue.length = 0;
    this.current?.runner.interrupt('conv_start');
  }

  trigger(def: EventDefinition, context: ConditionContext): TriggerDecision {
    const { gates, clock } = this.deps;
    if (gates.isConvLocked()) return { kind: 'blocked', reason: 'conv_locked' };
    if (!this.settings.masterEnabled) return this.deny(def, 'master_off');
    if (!gates.hasOutlet()) return this.deny(def, 'no_outlet');
    if (isQuietHour(context.time.hour, this.settings.quietStart, this.settings.quietEnd)) {
      return this.deny(def, 'quiet_hours');
    }

    const now = clock.now();
    const lastPlayed = this.deps.usage.lastPlayedAt(def.id);
    if (
      lastPlayed !== null &&
      now - lastPlayed < effectiveCooldown(def.cooldownMs, this.settings.tier)
    ) {
      return this.deny(def, 'cooldown');
    }
    if (def.maxPerDay !== undefined) {
      const today = this.deps.toDateKey(now);
      if (this.deps.usage.countPlayedToday(def.id, today) >= def.maxPerDay) {
        return this.deny(def, 'daily_cap');
      }
    }

    if (this.current) {
      return this.arbitrate(def, context);
    }
    return this.admit(def, context);
  }

  /** 当前有演出：ignore / replaceLowerPriority / replace */
  private arbitrate(def: EventDefinition, context: ConditionContext): TriggerDecision {
    if (!this.current) return this.admit(def, context);
    const currentDef = this.current.def;
    const preempt =
      def.interruptPolicy === 'replace' ||
      (def.interruptPolicy === 'replaceLowerPriority' && def.priority > currentDef.priority);
    if (!preempt) {
      if (def.interruptPolicy === 'ignore') return this.deny(def, 'ignored');
      return this.enqueue(def, context);
    }
    this.current.runner.interrupt('higher_priority');
    return this.admit(def, context);
  }

  private enqueue(def: EventDefinition, context: ConditionContext): TriggerDecision {
    if (this.queue.length < EVENT_QUEUE_LIMIT) {
      this.queue.push({ def, context, queuedAt: this.deps.clock.now() });
      return { kind: 'queued', position: this.queue.length };
    }
    // 队满：仅当新事件高于队中最低优先级时挤掉它，否则丢弃新事件
    let lowestIndex = 0;
    for (let i = 1; i < this.queue.length; i += 1) {
      if (this.queue[i]!.def.priority < this.queue[lowestIndex]!.def.priority) lowestIndex = i;
    }
    if (def.priority <= this.queue[lowestIndex]!.def.priority) {
      return this.deny(def, 'queue_full');
    }
    const removed = this.queue.splice(lowestIndex, 1)[0]!;
    this.recordSuppress(removed.def, 'queue_full');
    this.queue.push({ def, context, queuedAt: this.deps.clock.now() });
    return { kind: 'queued', position: this.queue.length };
  }

  private admit(def: EventDefinition, context: ConditionContext): TriggerDecision {
    const factory =
      this.deps.runnerFactory ??
      ((d, c) =>
        new EventRunner(d, c, {
          sink: this.deps.sink,
          gates: this.deps.gates,
          clock: this.deps.clock,
        }));
    const runner = factory(def, context);
    this.current = { runner, def };
    void runner.done().then((result) => this.onSettled(result));
    return { kind: 'admitted', runner };
  }

  private onSettled(result: {
    eventId: string;
    outcome: 'played' | 'skipped' | 'interrupted';
    reason?: string;
  }): void {
    const def = this.current?.def;
    this.deps.usage.record({
      eventId: result.eventId,
      playedAt: this.deps.clock.now(),
      outcome: result.outcome,
      reason: result.reason,
      priority: def?.priority ?? 1,
    });
    this.current = null;
    this.pumpQueue();
  }

  /** 当前演出结束后按 FIFO 补位；CONV/出口/勿扰状态已变则丢弃排队项 */
  private pumpQueue(): void {
    const { gates, clock } = this.deps;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      if (gates.isConvLocked()) {
        this.recordSuppress(item.def, 'conv_locked');
        continue;
      }
      if (!gates.hasOutlet()) {
        this.recordSuppress(item.def, 'no_outlet');
        continue;
      }
      if (isQuietHour(item.context.time.hour, this.settings.quietStart, this.settings.quietEnd)) {
        this.recordSuppress(item.def, 'quiet_hours');
        continue;
      }
      // 冷却/每日闸门为准入时判定，排队期间不再二次拦截
      this.admit(item.def, item.context);
      return;
    }
    void clock;
  }

  private deny(def: EventDefinition, reason: EventSuppressReason): TriggerDecision {
    this.recordSuppress(def, reason);
    return { kind: 'suppressed', reason };
  }

  private recordSuppress(def: EventDefinition, reason: string): void {
    this.deps.usage.record({
      eventId: def.id,
      playedAt: this.deps.clock.now(),
      outcome: 'suppressed',
      reason,
      priority: def.priority,
    });
  }
}

export { DEFAULT_QUIET };
