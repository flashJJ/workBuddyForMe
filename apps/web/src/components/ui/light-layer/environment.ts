/**
 * v2.20 M3 Light UI 运行环境：rAF、reduced motion 与随机数默认实现。
 * 测试可注入同名选项替换。
 */
export interface LightLayerOptions {
  requestFrame?: (callback: (time: number) => void) => number;
  cancelFrame?: (handle: number) => void;
  reducedMotion?: () => boolean;
  random?: () => number;
}

export interface Environment {
  requestFrame: (callback: (time: number) => void) => number;
  cancelFrame: (handle: number) => void;
  reducedMotion: () => boolean;
  random: () => number;
}

export function createEnvironment(options: LightLayerOptions): Environment {
  const hasWindow = typeof window !== 'undefined';
  return {
    requestFrame: (callback) =>
      hasWindow && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame(callback)
        : (setTimeout(() => callback(Date.now()), 16) as unknown as number),
    cancelFrame: (handle) => {
      if (hasWindow && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(handle);
      } else {
        clearTimeout(handle);
      }
    },
    reducedMotion: () =>
      hasWindow &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    random: () => Math.random(),
    ...(options.requestFrame ? { requestFrame: options.requestFrame } : {}),
    ...(options.cancelFrame ? { cancelFrame: options.cancelFrame } : {}),
    ...(options.reducedMotion ? { reducedMotion: options.reducedMotion } : {}),
    ...(options.random ? { random: options.random } : {}),
  };
}
