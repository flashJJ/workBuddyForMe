/** v4.18：最近搜索（本机 localStorage，最多 5 条；损坏时静默降级） */
export const RECENT_SEARCH_KEY = 'wbfm.globalSearch.recent';
export const MAX_RECENT_SEARCHES = 5;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readRecentSearches(storage: StorageLike | null): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_SEARCH_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const list: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const text = item.trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      list.push(text);
      if (list.length >= MAX_RECENT_SEARCHES) break;
    }
    return list;
  } catch {
    return [];
  }
}

export function rememberSearch(storage: StorageLike | null, query: string): string[] {
  const text = query.trim();
  if (!storage || !text) return readRecentSearches(storage);
  const next = [text, ...readRecentSearches(storage).filter((item) => item !== text)].slice(
    0,
    MAX_RECENT_SEARCHES,
  );
  try {
    storage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
  } catch {
    // 隐私模式/配额不足时静默降级
  }
  return next;
}

export function clearRecentSearches(storage: StorageLike | null): void {
  if (!storage) return;
  try {
    storage.removeItem(RECENT_SEARCH_KEY);
  } catch {
    // 忽略
  }
}
