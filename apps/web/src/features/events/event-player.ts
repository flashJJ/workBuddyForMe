/**
 * v1.7 EventPlayer：core EventRunner 的 EffectSink web 实现（M2）。
 *
 * 框架/渲染无关：只把引擎 effect 指令翻译到 v1.6 既有运行时——
 * - expression → Live2dController.setExpression/flashExpression（+桌宠表情中继）
 * - motion(tap) → Live2dController.tap
 * - gaze → Live2dController.setGaze（release 时回中，后续指针移动恢复跟随）
 * - fx → 视图态 fx 列表（EventFxLayer 用 DOM/CSS 呈现），到期自动摘除
 * - spatial → 主窗一律 no-op（仅桌宠形态可演，桌宠 IPC 后续版本接入）
 * - speech → 气泡字幕必有；speak=true 且语音桥就绪时走同一 AudioPlaybackQueue
 * - release → 表情交还情绪基线、视线回中、字幕/fx 清空、桌宠 state=idle
 *
 * 视图态用 useSyncExternalStore 兼容的 subscribe/getSnapshot 暴露。
 */
import {
  PET_SUBTITLE_MAX,
  type PetPerformanceEvent,
} from '@wbfm/shared/pet';
import type {
  EventFxId,
  EventMotionGroup,
  EventSpatialAction,
  ExpressionTag,
} from '@wbfm/shared/schemas';
import type { EventEffectSink } from '@wbfm/core/event-client';
import { clampGaze, EVENT_FX_DURATION_MS, type ActiveFx } from './fx-registry';

/** 纯气泡也至少展示此时长，避免极短合成/无声台词一闪而过 */
const BUBBLE_MIN_MS = 1200;

export interface EventPlayerView {
  playing: boolean;
  subtitle: string | null;
  fx: ActiveFx[];
}

/** 播放器所需的 Live2dController 结构面（与舞台动态 chunk 解耦，便于测试） */
export interface EventPlayerControllerLike {
  setExpression(tag: ExpressionTag): void | Promise<void>;
  flashExpression(tag: ExpressionTag, durationMs: number): void;
  tap(): void;
  setGaze(nx: number, ny: number): void;
}

/** 台词出声桥：合成→入唯一播放队列→等排空；abort 时立即停播并 resolve */
export interface EventSpeechBridge {
  speak(text: string, signal: AbortSignal): Promise<void>;
}

/** 计时器注入面（测试用假时钟，生产走浏览器原生） */
export interface EventPlayerTimers {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export interface EventPlayerDeps {
  /** Live2D 控制器（形象栏卸载期间为 null，视觉指令静默跳过、桌宠中继照常） */
  getController(): EventPlayerControllerLike | null;
  /** i18n 台词解析（event.* 键；M3 随内置剧本落词典） */
  resolveLine(lineKey: string): string;
  /** 出声桥；null/未就绪时 speech 自动降级纯气泡 */
  speech: EventSpeechBridge | null;
  /** release 时把表情控制权交还情绪基线（含桌宠表情中继，由 hook 实现） */
  restoreBaseline(): void;
  /** 桌宠表现中继（无桥环境注入 no-op） */
  relayPet(event: PetPerformanceEvent): void;
  /** 结构化告警（缺台词/出声失败等，永不阻断演出） */
  onWarn?(code: string, detail?: unknown): void;
  timers?: EventPlayerTimers;
}

export const defaultTimers: EventPlayerTimers = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id) => globalThis.clearTimeout(id),
};

export class EventPlayer implements EventEffectSink {
  private view: EventPlayerView = { playing: false, subtitle: null, fx: [] };
  private readonly listeners = new Set<() => void>();
  private fxSeq = 0;
  private readonly fxTimers = new Map<number, number>();
  private readonly timers: EventPlayerTimers;

  constructor(private readonly deps: EventPlayerDeps) {
    this.timers = deps.timers ?? defaultTimers;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): EventPlayerView => this.view;

  expression(tag: ExpressionTag, durationMs?: number): void {
    this.begin();
    const controller = this.deps.getController();
    if (durationMs && durationMs > 0) controller?.flashExpression(tag, durationMs);
    else void controller?.setExpression(tag);
    this.relayPet({ kind: 'expression', tag });
  }

  motion(group: EventMotionGroup): void {
    this.begin();
    if (group === 'tap') this.deps.getController()?.tap();
  }

  gaze(x: number, y: number): void {
    this.begin();
    this.deps.getController()?.setGaze(clampGaze(x), clampGaze(y));
  }

  fx(id: EventFxId): void {
    this.begin();
    const key = (this.fxSeq += 1);
    this.update({ fx: [...this.view.fx, { id, key }] });
    const handle = this.timers.setTimeout(() => this.removeFx(key), EVENT_FX_DURATION_MS[id]);
    this.fxTimers.set(key, handle);
  }

  spatial(_action: EventSpatialAction): void {
    this.begin();
    // 主窗 no-op：spatial 仅桌宠形态可演，桌宠 IPC 通道后续版本接入
  }

  async speech(lineKey: string, speak: boolean, signal: AbortSignal): Promise<void> {
    const text = this.deps.resolveLine(lineKey);
    await this.present(text, speak, signal, lineKey);
  }

  /**
   * v1.7 动态台词（角色化提醒原文）：与 speech 同管线（气泡+TTS+最短展示），
   * 但跳过 lineKey 解析。缺文本时 onWarn 并立即结束。
   */
  async speakText(text: string, speak: boolean, signal: AbortSignal): Promise<void> {
    await this.present(text, speak, signal);
  }

  private async present(
    text: string,
    speak: boolean,
    signal: AbortSignal,
    warnDetail?: string,
  ): Promise<void> {
    this.begin();
    if (!text) this.deps.onWarn?.('event.line.missing', warnDetail);
    this.update({ subtitle: text || null });
    this.relayPet({ kind: 'subtitle', text: (text || '').slice(0, PET_SUBTITLE_MAX) });

    const started = this.timers.now();
    if (speak && text && this.deps.speech && !signal.aborted) {
      try {
        await this.deps.speech.speak(text, signal);
      } catch (error) {
        // 出声失败不阻断：气泡照演，继续保证最短展示
        this.deps.onWarn?.('event.speech.failed', error instanceof Error ? error.message : error);
      }
    }
    if (signal.aborted) return;
    const elapsed = this.timers.now() - started;
    const rest = Math.max(0, BUBBLE_MIN_MS - elapsed);
    if (rest > 0) await this.sleep(rest, signal);
  }

  release(): void {
    for (const handle of this.fxTimers.values()) this.timers.clearTimeout(handle);
    this.fxTimers.clear();
    this.deps.getController()?.setGaze(0, 0);
    this.relayPet({ kind: 'subtitle', text: '' });
    this.relayPet({ kind: 'state', state: 'idle' });
    this.deps.restoreBaseline();
    this.view = { playing: false, subtitle: null, fx: [] };
    this.emit();
  }

  /** React 卸载：与 release 同口径清理（无演出时调用也幂等） */
  dispose(): void {
    this.release();
    this.listeners.clear();
  }

  private begin(): void {
    if (!this.view.playing) this.update({ playing: true });
  }

  private removeFx(key: number): void {
    this.fxTimers.delete(key);
    if (this.view.fx.length === 0) return;
    this.update({ fx: this.view.fx.filter((item) => item.key !== key) });
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const handle = this.timers.setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        this.timers.clearTimeout(handle);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private relayPet(event: PetPerformanceEvent): void {
    try {
      this.deps.relayPet(event);
    } catch (error) {
      this.deps.onWarn?.('event.pet.relayFailed', error instanceof Error ? error.message : error);
    }
  }

  private update(patch: Partial<EventPlayerView>): void {
    this.view = { ...this.view, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
