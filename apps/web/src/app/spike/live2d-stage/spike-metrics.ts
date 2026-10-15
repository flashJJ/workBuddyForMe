/**
 * v1.9 M0 spike 帧率/内存采集器（纯浏览器 rAF 采样，无框架依赖）。
 *
 * 注意：本采集器自身的 rAF 与 PIXI ticker 共享同一主线程帧回调，
 * 因此帧间隔反映的是「主线程可用于渲染的节拍」——与用户看到的帧率同口径。
 */

export interface ScenarioMetrics {
  /** 实测秒数（rAF 累计） */
  elapsedSec: number;
  /** 平均 FPS（帧数 / 实测秒数） */
  fpsMean: number;
  /** 1% low FPS（最慢 1% 帧折算的瞬时 fps 均值） */
  fpsOnePercentLow: number;
  /** 帧耗时毫秒分位 */
  frameP50: number;
  frameP95: number;
  frameP99: number;
  frameMax: number;
  /** >33.2ms 的帧（低于 30fps 节拍）数量 */
  longFrames: number;
  /** >50ms 的卡顿帧数量 */
  hitchFrames: number;
  /** performance.memory 采样（MB），不支持时为 null */
  heap: { startMb: number; endMb: number; peakMb: number; samples: number } | null;
}

interface HeapSample {
  usedJSHeapSize: number;
}

declare global {
  interface Window {
    performance: Performance & { memory?: HeapSample & { jsHeapSizeLimit: number } };
  }
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor((sortedAsc.length * p) / 100));
  return sortedAsc[idx]!;
}

export class FrameMetrics {
  private frames: number[] = [];
  private heapMb: number[] = [];
  private rafId = 0;
  private lastTs = 0;
  private heapTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * 帧间隔丢弃上限（ms）：默认 1000（切窗/后台标签的异常大值）。
   * v2.0 VRM 混排工装传 10000——双 WebGL context 退化时单帧可能 >1s，
   * 丢弃会采到 0 帧无法定位问题，慢帧本身就是要取证的对象。
   */
  constructor(private readonly maxFrameDeltaMs = 1000) {}

  start(): void {
    this.frames = [];
    this.heapMb = [];
    this.lastTs = 0;
    const tick = (ts: number) => {
      if (this.lastTs > 0) {
        const delta = ts - this.lastTs;
        // 后台标签页/首帧异常大值剔除（>上限视为切窗，不代表渲染性能）
        if (delta > 0 && delta < this.maxFrameDeltaMs) this.frames.push(delta);
      }
      this.lastTs = ts;
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
    if (window.performance.memory) {
      this.heapTimer = setInterval(() => {
        this.heapMb.push(window.performance.memory!.usedJSHeapSize / 1024 / 1024);
      }, 1000);
    }
  }

  stop(): ScenarioMetrics {
    cancelAnimationFrame(this.rafId);
    if (this.heapTimer) clearInterval(this.heapTimer);
    const sorted = [...this.frames].sort((a, b) => a - b);
    const elapsedSec = this.frames.reduce((sum, d) => sum + d, 0) / 1000;
    const tailCount = Math.max(1, Math.ceil(this.frames.length * 0.01));
    const slowest = sorted.slice(-tailCount);
    const tailFps = slowest.map((d) => 1000 / d);
    return {
      elapsedSec: Number(elapsedSec.toFixed(2)),
      fpsMean: elapsedSec > 0 ? Number((this.frames.length / elapsedSec).toFixed(1)) : 0,
      fpsOnePercentLow: Number((tailFps.reduce((s, v) => s + v, 0) / tailFps.length).toFixed(1)),
      frameP50: Number(percentile(sorted, 50).toFixed(2)),
      frameP95: Number(percentile(sorted, 95).toFixed(2)),
      frameP99: Number(percentile(sorted, 99).toFixed(2)),
      frameMax: Number((sorted[sorted.length - 1] ?? 0).toFixed(2)),
      longFrames: this.frames.filter((d) => d > 33.2).length,
      hitchFrames: this.frames.filter((d) => d > 50).length,
      heap:
        this.heapMb.length > 0
          ? {
              startMb: Number(this.heapMb[0]!.toFixed(1)),
              endMb: Number(this.heapMb[this.heapMb.length - 1]!.toFixed(1)),
              peakMb: Number(Math.max(...this.heapMb).toFixed(1)),
              samples: this.heapMb.length,
            }
          : null,
    };
  }
}

/** 采集 GPU/环境信息（写进报告，保证数字可复现） */
export function collectEnvironment(): Record<string, string | number> {
  const env: Record<string, string | number> = {
    hardwareConcurrency: navigator.hardwareConcurrency,
    devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    userAgent: navigator.userAgent,
  };
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) env.gpuRenderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
      env.webgl = String(gl.getParameter(gl.VERSION));
    }
  } catch {
    /* 取不到不阻塞 spike */
  }
  return env;
}
