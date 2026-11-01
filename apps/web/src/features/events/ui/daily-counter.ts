/**
 * v1.7 当日交互计数（localStorage，纯函数 + 可注入 Storage）。
 *
 * 「当日首次交互」是早安剧本的触发依据；跨自然日滚动归零。
 * SSR/隐私模式无 storage 时按「每天第 1 次」降级（不阻断触发）。
 */
import { localDateKey } from '@wbfm/shared/schemas';

const INTERACTIONS_KEY = 'wbfm.event.interactions.v1';

interface InteractionRecord {
  dateKey: string;
  count: number;
}

function safeStorage(storage: Storage | null | undefined): Storage | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readInteractionCounter(
  now: number,
  storage?: Storage | null,
): InteractionRecord {
  const store = safeStorage(storage);
  const today = localDateKey(now);
  if (!store) return { dateKey: today, count: 0 };
  try {
    const raw = store.getItem(INTERACTIONS_KEY);
    if (!raw) return { dateKey: today, count: 0 };
    const parsed = JSON.parse(raw) as Partial<InteractionRecord>;
    if (parsed.dateKey === today && typeof parsed.count === 'number' && parsed.count >= 0) {
      return { dateKey: today, count: parsed.count };
    }
    return { dateKey: today, count: 0 };
  } catch {
    return { dateKey: today, count: 0 };
  }
}

/** 记一次用户交互并返回新计数（跨日自动归零后计为 1） */
export function bumpInteractionCounter(
  now: number,
  storage?: Storage | null,
): InteractionRecord {
  const today = localDateKey(now);
  const current = readInteractionCounter(now, storage);
  const next: InteractionRecord = {
    dateKey: today,
    count: current.dateKey === today ? current.count + 1 : 1,
  };
  const store = safeStorage(storage);
  if (store) {
    try {
      store.setItem(INTERACTIONS_KEY, JSON.stringify(next));
    } catch {
      /* 配额/隐私模式：内存返回值仍有效 */
    }
  }
  return next;
}
