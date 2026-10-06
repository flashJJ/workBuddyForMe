import type { AudioPlayer } from './audio-playback-queue';
import type { VoiceAudioFrame } from './audio-playback-queue';

/**
 * 基于 AudioContext 的顺序播放器（浏览器侧）。
 * - base64 WAV → decodeAudioData → 直连 destination（M3 将在中间挂 Analyser 做口型）；
 * - cancelAll 中断全部正在播放的 buffer source；
 * - AudioContext 惰性创建（必须由用户手势/点击后的会话解锁自动播放策略）。
 */
export class WebAudioPlayer implements AudioPlayer {
  private ctx: AudioContext | null = null;
  private active: Set<AudioBufferSourceNode> = new Set();

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('当前浏览器不支持 Web Audio');
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  async play(frame: VoiceAudioFrame): Promise<void> {
    if (!frame.audio) return;
    const ctx = this.ensureCtx();
    const bytes = base64ToBytes(frame.audio);
    const buffer = await ctx.decodeAudioData(
      // bytes 为定长分配，其底层 buffer 即完整 WAV
      bytes.buffer as ArrayBuffer,
    );
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    this.active.add(source);
    await new Promise<void>((resolve) => {
      source.onended = () => {
        this.active.delete(source);
        resolve();
      };
      source.start();
    });
  }

  cancelAll(): void {
    for (const source of this.active) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        /* 已停止 */
      }
    }
    this.active.clear();
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
