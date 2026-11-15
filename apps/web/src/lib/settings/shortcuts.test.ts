import { describe, expect, it } from 'vitest';
import {
  EMPTY_SHORTCUT_STATE,
  MAX_RECENT_PANELS,
  MAX_SHORTCUTS,
  SETTINGS_SHORTCUTS_KEY,
  readShortcutState,
  rememberPanel,
  resolveShortcutState,
  shortcutIds,
  togglePinned,
  writeShortcutState,
} from './shortcuts';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    dump: () => data,
  };
}

describe('设置页常用入口（P9/P1）', () => {
  it('读取时丢弃未知、重复与超量 id', () => {
    const state = resolveShortcutState({
      pinned: ['backup', 'backup', 'missing', 'voice-preference'],
      recent: Array.from({ length: 12 }, () => 'about'),
    });
    expect(state.pinned).toEqual(['backup', 'voice-preference']);
    expect(state.recent).toEqual(['about']);
  });

  it('最近访问新→旧、去重并限制上限', () => {
    const visits = [
      'backup',
      'about',
      'voice-preference',
      'emotion',
      'memory',
      'skills',
      'tuning',
      'appearance',
      'providers',
      'defaults',
    ];
    let state = EMPTY_SHORTCUT_STATE;
    for (const id of visits) state = rememberPanel(state, id);
    expect(state.recent).toHaveLength(MAX_RECENT_PANELS);
    expect(state.recent[0]).toBe('defaults');

    state = rememberPanel(state, 'about');
    expect(state.recent[0]).toBe('about');
    expect(new Set(state.recent).size).toBe(state.recent.length);
    expect(rememberPanel(EMPTY_SHORTCUT_STATE, 'missing')).toBe(EMPTY_SHORTCUT_STATE);
  });

  it('置顶可切换，最多 6 个；常用列表置顶优先且去重', () => {
    let state = rememberPanel(EMPTY_SHORTCUT_STATE, 'about');
    state = togglePinned(state, 'backup');
    state = togglePinned(state, 'voice-preference');
    expect(shortcutIds(state)).toEqual(['voice-preference', 'backup', 'about']);

    expect(togglePinned(state, 'backup').pinned).toEqual(['voice-preference']);
    expect(togglePinned(state, 'missing')).toBe(state);

    let many = EMPTY_SHORTCUT_STATE;
    for (const id of ['backup', 'about', 'voice-preference', 'emotion', 'memory', 'skills', 'tuning']) {
      many = togglePinned(many, id);
    }
    expect(many.pinned).toHaveLength(MAX_SHORTCUTS);
    expect(shortcutIds(many)).toHaveLength(MAX_SHORTCUTS);
  });

  it('localStorage 往返与坏数据降级', () => {
    const storage = memoryStorage();
    const state = togglePinned(rememberPanel(EMPTY_SHORTCUT_STATE, 'backup'), 'about');
    writeShortcutState(storage, state);
    expect(readShortcutState(storage)).toEqual(state);
    expect(JSON.parse(storage.dump().get(SETTINGS_SHORTCUTS_KEY) ?? '{}')).toEqual(state);

    const broken = memoryStorage({ [SETTINGS_SHORTCUTS_KEY]: '{not-json' });
    expect(readShortcutState(broken)).toEqual(EMPTY_SHORTCUT_STATE);
    expect(readShortcutState(null)).toEqual(EMPTY_SHORTCUT_STATE);
  });
});
