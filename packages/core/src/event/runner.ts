/**
 * v1.7 EventRunner：单个剧本的一次演出生命周期（纯逻辑解释器）。
 *
 * 不建播放器、不碰 DOM：按 step 序向注入的 EffectSink 发指令；
 * 锁/时钟/上下文全部注入。打断统一走内部 AbortController：
 * - skip()：用户 Esc/点击 → outcome=skipped
 * - interrupt(reason)：CONV 开始/更高优先级/看门狗 → outcome=interrupted
 * 每个 step 边界都复查 CONV 锁（显式中断之外的兜底）。
 */
import {
  EVENT_MAX_DURATION_MS,
  EVENT_TTS_WAIT_MAX_MS,
  type EventDefinition,
  type EventEndReason,
  type EventStep,
} from '@wbfm/shared/schemas';
import { evaluateEventConditions } from './conditions';
import type { EventClock } from './clock';
import type {
  ConditionContext,
  EventEffectSink,
  EventRunGates,
  EventRunResult,
} from './types';

/** 轮询 TTS 锁的间隔（等待授权期间） */
const TTS_POLL_MS = 200;

export interface EventRunnerDeps {
  sink: EventEffectSink;
  gates: EventRunGates;
  clock: EventClock;
  /** 非法 branch 条件路径回调（结构化日志，不影响执行） */
  onInvalidCondition?: (path: string) => void;
}

/** abort 信号的可 await 形式（sink 不响应信号时引擎也不挂死） */
function abortSignal(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

export class EventRunner {
  readonly eventId: string;

  private readonly ac = new AbortController();
  // 注意：必须先声明（类字段按序定义），settled 执行器才不会被后续 define 覆盖
  private resolveSettled!: (result: EventRunResult) => void;
  private readonly settled = new Promise<EventRunResult>((resolve) => {
    this.resolveSettled = resolve;
  });
  private endReason: EventEndReason | null = null;
  private finished = false;
  private effectsFired = 0;
  private cancelWatchdog: (() => void) | null = null;
  private pc = 0;

  constructor(
    private readonly def: EventDefinition,
    private readonly context: ConditionContext,
    private readonly deps: EventRunnerDeps,
  ) {
    this.eventId = def.id;
    void this.run();
  }

  /** 用户跳过（Esc/点击；无负面情绪） */
  skip(): void {
    this.interrupt('user_skip');
  }

  /** 外部打断：CONV 开始 / 更高优先级 / 看门狗（首次原因生效） */
  interrupt(reason: EventEndReason): void {
    if (this.finished) return;
    this.endReason ??= reason;
    this.ac.abort();
  }

  /** 演出终态 Promise（director 据此 pump 队列） */
  done(): Promise<EventRunResult> {
    return this.settled;
  }

  private async run(): Promise<void> {
    const { clock, sink, gates } = this.deps;
    const startedAt = clock.now();
    this.cancelWatchdog = clock.timeout(
      () => this.interrupt('watchdog'),
      EVENT_MAX_DURATION_MS,
    );

    let crashed = false;
    try {
      while (this.pc < this.def.steps.length) {
        if (this.ac.signal.aborted) break;
        if (gates.isConvLocked()) {
          this.interrupt('conv_start');
          break;
        }
        const step = this.def.steps[this.pc]!;
        const advance = await this.execute(step);
        if (advance === 'abort') break;
        if (advance === 'jump') continue; // branch 已改写 pc，跳过自增
        this.pc += 1;
      }
    } catch {
      // sink 异常不允许击垮引擎：按打断收尾并释放资源
      crashed = true;
      this.endReason ??= 'higher_priority';
      this.ac.abort();
    } finally {
      this.cancelWatchdog?.();
      sink.release();
      this.finish({
        eventId: this.eventId,
        outcome: crashed || this.ac.signal.aborted
          ? this.endReason === 'user_skip'
            ? 'skipped'
            : 'interrupted'
          : 'played',
        reason: this.endReason ?? undefined,
        startedAt,
        endedAt: clock.now(),
        effectsFired: this.effectsFired,
      });
    }
  }

  /** 执行结果：abort=中止循环；jump=branch 已跳转；next=顺序前进 */
  private async execute(step: EventStep): Promise<'abort' | 'jump' | 'next'> {
    const { sink, clock } = this.deps;
    switch (step.kind) {
      case 'expression':
        sink.expression(step.tag, step.durationMs);
        this.effectsFired += 1;
        return 'next';
      case 'motion':
        sink.motion(step.group);
        this.effectsFired += 1;
        return 'next';
      case 'gaze':
        sink.gaze(step.x, step.y);
        this.effectsFired += 1;
        return 'next';
      case 'fx':
        sink.fx(step.id);
        this.effectsFired += 1;
        return 'next';
      case 'spatial':
        sink.spatial(step.action);
        this.effectsFired += 1;
        return 'next';
      case 'wait': {
        const aborted = await clock.sleep(step.ms, this.ac.signal);
        if (aborted) return 'abort';
        this.effectsFired += 1;
        return 'next';
      }
      case 'branch': {
        if (evaluateEventConditions(this.context, step.when, this.deps.onInvalidCondition)) {
          this.pc = step.goto; // schema 已保证严格前跳
          return 'jump';
        }
        return 'next';
      }
      case 'speech':
        return this.executeSpeech(step);
      default:
        return 'next';
    }
  }

  /**
   * speech：气泡字幕必有；TTS 出声按 step 偏好 + 锁策略决定。
   * queue：轮询等锁 ≤30s（期间 CONV/abort 立即中止），超时降级纯气泡；
   * skip：锁占用立即放弃出声。无论是否出声都 await sink.speech 呈现。
   */
  private async executeSpeech(
    step: Extract<EventStep, { kind: 'speech' }>,
  ): Promise<'abort' | 'next'> {
    const { clock, gates, sink } = this.deps;
    let speak = step.tts !== false;

    if (speak && gates.isTtsLocked()) {
      if (gates.isConvLocked()) {
        this.interrupt('conv_start');
        return 'abort';
      }
      if (this.def.speechLock === 'skip') {
        speak = false;
      } else {
        const deadline = clock.now() + EVENT_TTS_WAIT_MAX_MS;
        while (gates.isTtsLocked() && clock.now() < deadline) {
          const aborted = await clock.sleep(TTS_POLL_MS, this.ac.signal);
          if (aborted) return 'abort';
          if (gates.isConvLocked()) {
            this.interrupt('conv_start');
            return 'abort';
          }
        }
        if (gates.isTtsLocked()) speak = false; // 等待超时：气泡照出，不抢麦
      }
    }

    await Promise.race([
      Promise.resolve(sink.speech(step.lineKey, speak, this.ac.signal)),
      abortSignal(this.ac.signal),
    ]);
    this.effectsFired += 1;
    return this.ac.signal.aborted ? 'abort' : 'next';
  }

  private finish(result: EventRunResult): void {
    if (this.finished) return;
    this.finished = true;
    this.resolveSettled(result);
  }
}
