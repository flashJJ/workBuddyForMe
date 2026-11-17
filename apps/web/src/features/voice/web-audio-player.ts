import type { AudioPlayer } from './audio-playback-queue';
import type { VoiceAudioFrame } from './audio-playback-queue';
import { applySinkId, type SinkIdTarget } from '../audio';

/**
 * 基于 AudioContext 的顺序播放器（浏览器侧）。
 * - base64 WAV → decodeAudioData → Analyser(直通) → destination；
 * - Analyser 供 Live2D 口型按 RMS 驱动（getLevel），不占额外音频资源；
 * - 另接一路 ScriptProcessor（经 0 增益 GainNode 落地 destination）：
 *   onaudioprocess 随音频渲染线程触发，主窗隐藏后 rAF/定时器会被节流，
 *   但该回调只要在播音就持续 tick——M4 桌宠中继电平走这条通道；
 * - cancelAll 中断全部正在播放的 buffer source；
 * - AudioContext 惰性创建（必须由用户手势/点击后的会话解锁自动播放策略）。
 */
export interface WebAudioPlayerOptions {
  /** 每音频帧回调当前 RMS（0~1）；仅活动声源期触发，隐藏窗口也不暂停 */
  onLevel?: (level: number) => void;
}

export class WebAudioPlayer implements AudioPlayer {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelData: Uint8Array<ArrayBuffer> | null = null;
  private active: Set<AudioBufferSourceNode> = new Set();
  /** 取消代际：decodeAudioData 期间被 cancel 的帧不得再启动声源 */
  private epoch = 0;
  private readonly onLevel?: (level: number) => void;
  /** v4.3 M4：输出设备偏好；AudioContext 惰性创建后补应用 */
  private outputDevice: string | null = null;

  constructor(options: WebAudioPlayerOptions = {}) {
    this.onLevel = options.onLevel;
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('当前浏览器不支持 Web Audio');
      this.ctx = new Ctor();
      if (this.outputDevice) {
        void applySinkId(this.ctx as unknown as SinkIdTarget, this.outputDevice);
      }
      // Analyser 直通 destination：只做旁路分析，不改变音量/音色
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.55;
      this.analyser.connect(this.ctx.destination);
      this.levelData = new Uint8Array(this.analyser.fftSize);

      // 电平旁路：processor 必须经 0 增益 GainNode 连到 destination 才会被持续调度
      // （只连输入不连输出时 Chromium 不触发 onaudioprocess）
      const processor = this.ctx.createScriptProcessor(512, 1, 1);
      const mute = this.ctx.createGain();
      mute.gain.value = 0;
      this.analyser.connect(processor);
      processor.connect(mute);
      mute.connect(this.ctx.destination);
      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!this.onLevel || this.active.size === 0) return;
        const data = event.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i]! * data[i]!;
        this.onLevel(Math.sqrt(sum / data.length));
      };
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** 用户手势内同步解锁 AudioContext（自动播放策略） */
  unlock(): void {
    try {
      this.ensureCtx();
    } catch {
      /* 浏览器不支持 Web Audio */
    }
  }

  async play(frame: VoiceAudioFrame): Promise<void> {
    if (!frame.audio) return;
    const ctx = this.ensureCtx();
    const epoch = this.epoch;
    const bytes = base64ToBytes(frame.audio);
    const buffer = await ctx.decodeAudioData(
      // bytes 为定长分配，其底层 buffer 即完整 WAV
      bytes.buffer as ArrayBuffer,
    );
    // 解码期间发生 cancel：旧帧不能再启动，否则会与新一轮语音重叠
    if (epoch !== this.epoch) return;
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

  /** v4.3 M4：切换 AudioContext 输出设备；不支持时静默忽略 */
  setOutputDevice(deviceId: string | null): void {
    this.outputDevice = deviceId;
    if (!this.ctx) return;
    void applySinkId(this.ctx as unknown as SinkIdTarget, deviceId);
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
    this.epoch += 1;
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
