/**
 * 帧率看门狗（v1.9 M1，docs/plan/v1.9/01 §6 承诺）：
 * 连续 5s 平均帧耗 >25ms（低于 ~40fps）时通知上层自动切省电档（方案 C）。
 * 判定逻辑为纯函数（evaluateWatchdog），rAF 采集与告警去抖在 hook 里。
 */

export const WATCHDOG_WINDOW_MS = 5_000;
/** 平均帧耗阈值：>25ms 视为持续卡顿 */
export const WATCHDOG_AVG_FRAME_MS = 25;
/** 窗口内最少帧数才判定（避免切场景瞬间 1-2 帧误报） */
export const WATCHDOG_MIN_FRAMES = 60;

export interface WatchdogReading {
  avgFrameMs: number;
  slow: boolean;
}

/**
 * 纯判定：窗口内帧耗均值是否持续超标。
 * @param deltas 最近窗口内的逐帧毫秒数
 */
export function evaluateWatchdog(deltas: number[]): WatchdogReading {
  if (deltas.length < WATCHDOG_MIN_FRAMES) return { avgFrameMs: 0, slow: false };
  const sum = deltas.reduce((acc, d) => acc + d, 0);
  const avgFrameMs = sum / deltas.length;
  return { avgFrameMs, slow: avgFrameMs > WATCHDOG_AVG_FRAME_MS };
}

/**
 * 运行时采集器：rAF 滚动保留最近 5s 帧耗；慢帧状态只在 false→true 时回调一次，
 * 恢复不自动升档（切回全 Live2D 由用户手动，避免低档机反复横跳）。
 */
export class FrameWatchdog {
  private rafId = 0;
  private lastTs = 0;
  private frames: Array<{ ts: number; delta: number }> = [];
  private alreadyFired = false;

  start(onSlow: (avgFrameMs: number) => void): void {
    this.stop();
    this.frames = [];
    this.alreadyFired = false;
    this.lastTs = 0;
    const tick = (ts: number) => {
      if (this.lastTs > 0) {
        const delta = ts - this.lastTs;
        if (delta > 0 && delta < 1000) {
          this.frames.push({ ts, delta });
          const cutoff = ts - WATCHDOG_WINDOW_MS;
          this.frames = this.frames.filter((f) => f.ts >= cutoff);
          if (!this.alreadyFired) {
            const reading = evaluateWatchdog(this.frames.map((f) => f.delta));
            if (reading.slow) {
              this.alreadyFired = true;
              onSlow(reading.avgFrameMs);
            }
          }
        }
      }
      this.lastTs = ts;
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }
}
