import { describe, expect, it } from 'vitest';
import {
  MAX_RECENT_SEARCHES,
  clearRecentSearches,
  readRecentSearches,
  rememberSearch,
} from './recent-searches';

function memoryStorage(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set('wbfm.globalSearch.recent', initial);
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe('v4.18 最近搜索', () => {
  it('去重、置顶并最多保留 5 条', () => {
    const storage = memoryStorage();
    for (const term of ['一', '二', '三', '四', '五', '六']) rememberSearch(storage, term);
    expect(readRecentSearches(storage)).toEqual(['六', '五', '四', '三', '二']);
    rememberSearch(storage, '三');
    expect(readRecentSearches(storage)).toEqual(['三', '六', '五', '四', '二']);
    expect(readRecentSearches(storage)).toHaveLength(MAX_RECENT_SEARCHES);
  });

  it('损坏数据降级为空数组', () => {
    expect(readRecentSearches(memoryStorage('{oops'))).toEqual([]);
    expect(readRecentSearches(memoryStorage('"not-array"'))).toEqual([]);
    expect(readRecentSearches(memoryStorage('["ok",1,null,"ok"]'))).toEqual(['ok']);
  });

  it('可清除', () => {
    const storage = memoryStorage();
    rememberSearch(storage, '青鸟');
    clearRecentSearches(storage);
    expect(readRecentSearches(storage)).toEqual([]);
  });
});
