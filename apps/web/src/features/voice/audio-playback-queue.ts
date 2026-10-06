import type { SsePayloadMap } from '@wbfm/shared';

export type VoiceAudioFrame = SsePayloadMap['voice_audio'];
export type VoiceState = SsePayloadMap['voice_state']['state'];

/** 播放器抽象：把一段音频播完；返回的 cancel 可立即中断 */
export interface AudioPlayer {
  play(frame: VoiceAudioFrame): Promise<void>;
  cancelAll(): void;
}

/**
 * 语音帧顺序播放队列（框架无关，React hook 只负责接 AudioContext）。
 *
 * - 有 audio 的帧严格串行播放（单写者，杜绝重叠/抢占）；
 * - audio=null 的帧（纯表情/空片段）跳过；
 * - final=true：标记本轮结束，排空后回调 onDrain；
 * - cancel：停止当前与后续排队，状态回到 idle；
 * - 新一轮 final 之前若旧队列未排空，先排空旧帧（同一对话连续场景由 cancel 兜底）。
 */
export class AudioPlaybackQueue {
  private queue: VoiceAudioFrame[] = [];
  private running = false;
  private disposed = false;

  constructor(
    private readonly player: AudioPlayer,
    private readonly onState?: (state: VoiceState) => void,
  ) {}

  enqueue(frame: VoiceAudioFrame): void {
    if (this.disposed) return;
    this.queue.push(frame);
    if (frame.audio) this.onState?.('speaking');
    void this.pump();
  }

  /** 取消全部播放（停止生成/急停/切换会话） */
  cancel(): void {
    this.queue = [];
    this.player.cancelAll();
    this.running = false;
    this.onState?.('idle');
  }

  dispose(): void {
    this.cancel();
    this.disposed = true;
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const frame = this.queue.shift()!;
        if (frame.audio) {
          try {
            await this.player.play(frame);
          } catch {
            // 单帧失败不阻断后续
          }
        }
        if (frame.final) {
          this.queue = [];
          this.onState?.('idle');
        }
      }
    } finally {
      this.running = false;
    }
  }
}
