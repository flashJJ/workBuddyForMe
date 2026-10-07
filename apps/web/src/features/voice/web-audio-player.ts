import type { AudioPlayer } from './audio-playback-queue';
import type { VoiceAudioFrame } from './audio-playback-queue';

/**
 * 基于 AudioContext 的顺序播放器（浏览器侧）。
 * - base64 WAV → decodeAudioData → Analyser(直通) → destination；
 * - Analyser 供 Live2D 口型按 RMS 驱动（getLevel），不占额外音频资源；
 * - cancelAll 中断全部正在播放的 buffer source；
 * - AudioContext 惰性创建（必须由用户手势/点击后的会话解锁自动播放策略）。
 */
export class WebAudioPlayer implements AudioPlayer {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelData: Uint8Array<ArrayBuffer> | null = null;
  private active: Set<AudioBufferSourceNode> = new Set();

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('当前浏览器不支持 Web Audio');
      this.ctx = new Ctor();
      // Analyser 直通 destination：只做旁路分析，不改变音量/音色
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.55;
      this.analyser.connect(this.ctx.destination);
      this.levelData = new Uint8Array(this.analyser.fftSize);
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
    source.connect(this.analyser!);
    this.active.add(source);
    await new Promise<void>((resolve) => {
      source.onended = () => {
        this.active.delete(source);
        resolve();
      };
      source.start();
    });
  }

  /** 当前播放电平 RMS（0~1）；无活动声源时为 0 */
  getLevel(): number {
    if (!this.analyser || !this.levelData || this.active.size === 0) return 0;
    this.analyser.getByteTimeDomainData(this.levelData);
    let sum = 0;
    for (let i = 0; i < this.levelData.length; i += 1) {
      const v = (this.levelData[i]! - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.levelData.length);
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
