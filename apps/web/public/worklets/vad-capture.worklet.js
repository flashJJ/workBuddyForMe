/* eslint-env es2022 */
/* global sampleRate */
/**
 * M4-VAD 采集 Worklet（原生 JS，由 public/ 静态提供，无构建依赖）。
 *
 * 职责（不做任何状态决策）：
 * - 输入设备原始采样率（常见 48k）→ 流式线性插值降采样到 16k 单声道；
 * - 每 512 个 16k 样本（32ms）产出一帧，postMessage 同时给出 RMS；
 * - ArrayBuffer transfer 零拷贝。
 * 状态机/底噪/门控全部在主线程 VadDetector 内，便于单测。
 */
const TARGET_RATE = 16000;
const FRAME_SAMPLES = 512; // 16k 下 32ms

class VadCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.frac = 0;
    this.out = new Float32Array(FRAME_SAMPLES);
    this.outLen = 0;
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input || input.length === 0) return true;

    // 流式线性插值：x 为输出样本相对当前块起点的源位置（frac 跨块续接）
    const L = input.length;
    let x = this.frac;
    for (; x < L; x += this.ratio) {
      const i = Math.floor(x);
      const f = x - i;
      const s0 = input[i];
      const s1 = input[Math.min(i + 1, L - 1)];
      this.appendSample(s0 * (1 - f) + s1 * f);
    }
    // 下一块首个输出样本的相对位置（落在 [0, ratio)）
    const stepped = Math.ceil((L - this.frac) / this.ratio) * this.ratio;
    this.frac = this.frac + stepped - L;
    return true;
  }

  appendSample(v) {
    this.out[this.outLen] = v;
    this.outLen += 1;
    if (this.outLen === FRAME_SAMPLES) {
      let sum = 0;
      for (let i = 0; i < FRAME_SAMPLES; i += 1) sum += this.out[i] * this.out[i];
      const rms = Math.sqrt(sum / FRAME_SAMPLES);
      const pcm = this.out;
      this.port.postMessage({ rms, pcm16k: pcm.buffer }, [pcm.buffer]);
      this.out = new Float32Array(FRAME_SAMPLES);
      this.outLen = 0;
    }
  }
}

registerProcessor('vad-capture', VadCaptureProcessor);
