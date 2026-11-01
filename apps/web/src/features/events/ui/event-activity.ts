/**
 * v1.7 最近用户交互时刻（localStorage，供条件 time.lastInteractionMin 读取）。
 *
 * 与 useProactiveChat 的内存计时互补：剧本条件需要跨重载/跨窗口口径，
 * 离散事件（发消息/按键/点击/滚动）由 stage hook 节流写入。
 */
const LAST_ACTIVITY_KEY = 'wbfm.event.lastActivityAt.v1';
/** 写盘节流：连续离散活动最快 1s 落一次（与主动搭话口径一致） */
export const ACTIVITY_WRITE_THROTTLE_MS = 1000;

function getStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 记录一次用户活动（节流由调用方或本函数内置） */
export function markActivity(now: number = Date.now()): void {
  const store = getStore();
  if (!store) return;
  try {
    store.setItem(LAST_ACTIVITY_KEY, String(now));
  } catch {
    /* ignore */
  }
}

/** 距上次交互的分钟数；无记录时返回 null（条件按缺失路径=false 处理） */
export function readLastInteractionMinutes(now: number = Date.now()): number | null {
  const store = getStore();
  if (!store) return null;
  try {
    const raw = store.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const at = Number(raw);
    if (!Number.isFinite(at) || at <= 0) return null;
    return Math.max(0, Math.round((now - at) / 60000));
  } catch {
    return null;
  }
}
