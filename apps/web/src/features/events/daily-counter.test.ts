import { describe, expect, it } from 'vitest';
import { bumpInteractionCounter, readInteractionCounter } from './daily-counter';

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

// 2026-10-13 15:40 本地；同日 23:59 与次日 00:01
const DAY1 = new Date(2026, 9, 13, 15, 40).getTime();
const DAY1_LATE = new Date(2026, 9, 13, 23, 59).getTime();
// 注意 JS 月份 0-based：9=10 月（DAY1 2026-10-13 的次日）
const DAY2 = new Date(2026, 9, 14, 0, 1).getTime();

describe('daily-counter', () => {
  it('无 storage：降级恒为第 1 次（不抛错）', () => {
    expect(readInteractionCounter(DAY1, null)).toEqual({ dateKey: '2026-10-13', count: 0 });
    expect(bumpInteractionCounter(DAY1, null)).toEqual({ dateKey: '2026-10-13', count: 1 });
  });

  it('同日累加、跨自然日归零重计；损坏 JSON 容错', () => {
    const storage = memStorage();
    expect(bumpInteractionCounter(DAY1, storage)).toEqual({ dateKey: '2026-10-13', count: 1 });
    expect(bumpInteractionCounter(DAY1_LATE, storage).count).toBe(2);
    expect(readInteractionCounter(DAY1_LATE, storage).count).toBe(2);

    expect(bumpInteractionCounter(DAY2, storage)).toEqual({ dateKey: '2026-10-14', count: 1 });

    storage.setItem('wbfm.event.interactions.v1', '{broken');
    expect(readInteractionCounter(DAY2, storage)).toEqual({ dateKey: '2026-10-14', count: 0 });
  });
});
