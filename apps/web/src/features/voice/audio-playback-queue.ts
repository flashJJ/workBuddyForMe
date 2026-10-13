import type { SsePayloadMap } from '@wbfm/shared/api';

export type VoiceAudioFrame = SsePayloadMap['voice_audio'];
export type VoiceState = SsePayloadMap['voice_state']['state'];

/** 播放器抽象：把一段音频播完；返回的 cancel 可立即中断 */
export interface AudioPlayer {
  play(frame: VoiceAudioFrame): Promise<void>;
  cancelAll(): void;
  /** 可选：当前播放电平 RMS（0~1），供 Live2D 口型驱动 */
  getLevel?(): number;
}

interface StampedFrame {
  frame: VoiceAudioFrame;
  /** 入队时的代际：cancel 后旧轮迟到帧（含 final）一律作废 */
  epoch: number;
}

/**
 * 语音帧顺序播放队列（框架无关，React hook 只负责接 AudioContext）。
 *
 * - 有 audio 的帧严格串行播放（单写者，杜绝重叠/抢占）；
 * - audio=null 的帧（纯表情/空片段）跳过；
 * - final=true：标记本轮结束，排空后回调 onDrain；
 * - cancel：停止当前与后续排队，代际 +1——barge-in 后网络缓冲里迟到的
 *   旧轮帧（包括会错误复位状态的 final）按 epoch 丢弃；
 * - 新一轮 final 之前若旧队列未排空，先排空旧帧（同一对话连续场景由 cancel 兜底）。
 */
export class AudioPlaybackQueue {
  private queue: StampedFrame[] = [];
  private disposed = false;
  private epoch = 0;
  /** 当前泵循环令牌；cancel 作废旧泵，防止 await 返回后与新泵并发 */
  private pumpToken: object | null = null;
  /** v1.7：队列排空等待者（事件台词入队后等播完，不新开音频通道） */
  private drainWaiters: Array<() => void> = [];

  constructor(
    private readonly player: AudioPlayer,
    private readonly onState?: (state: VoiceState) => void,
  ) {}

  enqueue(frame: VoiceAudioFrame): void {
    if (this.disposed) return;
    this.queue.push({ frame, epoch: this.epoch });
    if (frame.audio) this.onState?.('speaking');
    void this.pump();
  }

  /** 取消全部播放（停止生成/急停/切换会话/barge-in），并进入新一代际 */
  cancel(): void {
    this.queue = [];
    this.epoch += 1;
    this.pumpToken = null;
    this.player.cancelAll();
    this.onState?.('idle');
    // 代际作废：等待者按「本次占用结束」立即解除（调用方自行复查 abort 信号）
    this.flushDrainWaiters();
  }

  /**
   * v1.7：等待当前播放轮排空（事件 speech 复用同一 AudioContext 队列）。
   * 以泵循环存活为准——帧在播放开始时即 shift 出队列，但 pump 要等播放器 resolve
   * 才结束；无泵/已 dispose 立即 resolve；cancel 代际切换或 signal abort 立即 resolve。
   * 注意：以「final 收尾的单段剪辑」为使用口径——流式多帧在调用瞬间若无泵也会解除。
   */
  waitDrained(signal?: AbortSignal): Promise<void> {
    if (this.disposed || this.pumpToken === null) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', done);
        this.drainWaiters = this.drainWaiters.filter((w) => w !== done);
        resolve();
      };
      signal?.addEventListener('abort', done, { once: true });
      this.drainWaiters.push(done);
    });
  }

  private flushDrainWaiters(): void {
    const waiters = this.drainWaiters;
    this.drainWaiters = [];
    for (const done of waiters) done();
  }

  /** 当前代际（编排/测试用） */
  getEpoch(): number {
    return this.epoch;
  }

  /** 当前播放电平（播放器不支持或无活动声源时为 0） */
  getLevel(): number {
    return this.player.getLevel?.() ?? 0;
  }

  dispose(): void {
    this.cancel();
    this.disposed = true;
  }

  private async pump(): Promise<void> {
    if (this.pumpToken) return;
    const token = {};
    this.pumpToken = token;
    try {
      while (this.queue.length > 0) {
        const stamped = this.queue.shift()!;
        // 代际失效：旧轮迟到帧不落播放器；旧 final 也不得复位新轮状态
        if (stamped.epoch !== this.epoch) continue;
        const { frame } = stamped;
        if (frame.audio) {
          try {
            await this.player.play(frame);
          } catch {
            // 单帧失败不阻断后续
          }
          // await 期间可能已被 cancel 作废：旧泵立即退出，不碰队列与状态
          if (this.pumpToken !== token) return;
        }
        if (frame.final) {
          this.queue = this.queue.filter((item) => item.epoch === this.epoch);
          this.onState?.('idle');
        }
      }
    } finally {
      if (this.pumpToken === token) {
        // 泵循环走到此处必然已无排队帧；解除事件台词的排空等待
        this.pumpToken = null;
        this.flushDrainWaiters();
      }
    }
  }
}
