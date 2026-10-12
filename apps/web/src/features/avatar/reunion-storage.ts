/**
 * v1.6 M5 久别迎接的跨窗口本地状态（G6）。
 *
 * 主窗与桌宠窗同源共享 localStorage：
 * - REUNION_STORAGE_KEY：去重记忆（已迎接过哪一波久别），保证每次久别全局只迎接一次；
 * - REUNION_SIGNAL_KEY：主窗回到前台时写入时间戳，桌宠窗经 storage 事件被唤醒判定。
 *
 * 全部 SSR 容错（无 localStorage 时静默降级为不迎接）。
 */
import { REUNION_STORAGE_KEY } from '@wbfm/shared/constants';
import type { ReunionMemory } from '@wbfm/shared/schemas';

const REUNION_SIGNAL_KEY = 'wbfm.reunion.signal.v1';

export function readReunionMemory(): ReunionMemory | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(REUNION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReunionMemory>;
    if (
      typeof parsed.greetedInteractionAt === 'number' &&
      typeof parsed.greetedAt === 'number'
    ) {
      return {
        greetedInteractionAt: parsed.greetedInteractionAt,
        greetedAt: parsed.greetedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeReunionMemory(memory: ReunionMemory): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REUNION_STORAGE_KEY, JSON.stringify(memory));
  } catch {
    /* 隐私模式/配额：降级为本次会话内无去重，不阻断迎接 */
  }
}

/** 主窗回前台：写信号唤醒其他窗口（同值不重复触发，故带时间戳） */
export function pulseReunionSignal(now: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REUNION_SIGNAL_KEY, String(now));
  } catch {
    /* ignore */
  }
}

/** 订阅别的窗口写入的前台信号（本窗口自身写入不触发 storage 事件） */
export function onReunionSignal(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: StorageEvent): void => {
    if (event.key === REUNION_SIGNAL_KEY) callback();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
