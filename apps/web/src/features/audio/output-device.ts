import { AUDIO_OUTPUT_STORAGE_KEY } from './constants';

/** v4.3 M4：HTMLMediaElement / AudioContext 的 setSinkId 最小结构 */
export interface SinkIdTarget {
  setSinkId?: (deviceId: string) => Promise<void>;
}

export type SinkIdResult = 'applied' | 'fallback' | 'unsupported';

export function normalizeOutputDevice(deviceId: string | null | undefined): string | null {
  const value = deviceId?.trim();
  return value ? value : null;
}

/**
 * 切换输出设备；设备消失或权限变化时二次尝试系统默认。
 * 返回 applied/fallback 便于测试与诊断，调用方通常无需等待。
 */
export async function applySinkId(
  target: SinkIdTarget | null,
  deviceId: string | null,
): Promise<SinkIdResult> {
  if (!target || typeof target.setSinkId !== 'function') return 'unsupported';
  const id = normalizeOutputDevice(deviceId) ?? '';
  try {
    await target.setSinkId(id);
    return 'applied';
  } catch {
    try {
      await target.setSinkId('');
      return 'fallback';
    } catch {
      return 'unsupported';
    }
  }
}

export function readOutputDevicePreference(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return normalizeOutputDevice(window.localStorage.getItem(AUDIO_OUTPUT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeOutputDevicePreference(deviceId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const value = normalizeOutputDevice(deviceId);
    if (value) window.localStorage.setItem(AUDIO_OUTPUT_STORAGE_KEY, value);
    else window.localStorage.removeItem(AUDIO_OUTPUT_STORAGE_KEY);
  } catch {
    /* 隐私模式忽略 */
  }
}
