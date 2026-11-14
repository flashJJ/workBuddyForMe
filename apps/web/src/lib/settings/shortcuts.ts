import { SETTINGS_PANELS } from './catalog';

/**
 * P9/P1：设置页常用入口（收藏 + 最近访问）。
 *
 * 只存面板 id，标题与别名仍从注册表读取；未知 id 在读取时丢弃，
 * 面板下线后不会留下坏入口。数据放 localStorage，跨会话保留。
 */

export const SETTINGS_SHORTCUTS_KEY = 'wbfm.settings.shortcuts';
export const MAX_RECENT_PANELS = 8;
export const MAX_SHORTCUTS = 6;

export interface SettingsShortcutState {
  /** 用户手动置顶（顺序即展示顺序） */
  pinned: string[];
  /** 最近访问（新→旧） */
  recent: string[];
}

const KNOWN_PANEL_IDS = new Set<string>(SETTINGS_PANELS.map((panel) => panel.id));

export const EMPTY_SHORTCUT_STATE: SettingsShortcutState = { pinned: [], recent: [] };

function sanitizeIds(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !KNOWN_PANEL_IDS.has(item) || seen.has(item)) continue;
    seen.add(item);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

export function resolveShortcutState(raw: unknown): SettingsShortcutState {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  return {
    pinned: sanitizeIds(value?.pinned, MAX_SHORTCUTS),
    recent: sanitizeIds(value?.recent, MAX_RECENT_PANELS),
  };
}

export function readShortcutState(storage: Pick<Storage, 'getItem'> | null): SettingsShortcutState {
  if (!storage) return EMPTY_SHORTCUT_STATE;
  try {
    const raw = storage.getItem(SETTINGS_SHORTCUTS_KEY);
    return raw ? resolveShortcutState(JSON.parse(raw)) : EMPTY_SHORTCUT_STATE;
  } catch {
    return EMPTY_SHORTCUT_STATE;
  }
}

export function writeShortcutState(
  storage: Pick<Storage, 'setItem'> | null,
  state: SettingsShortcutState,
): void {
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_SHORTCUTS_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式/配额不足时静默降级，不影响设置页使用
  }
}

export function rememberPanel(state: SettingsShortcutState, id: string): SettingsShortcutState {
  if (!KNOWN_PANEL_IDS.has(id)) return state;
  return {
    pinned: state.pinned,
    recent: [id, ...state.recent.filter((item) => item !== id)].slice(0, MAX_RECENT_PANELS),
  };
}

export function togglePinned(state: SettingsShortcutState, id: string): SettingsShortcutState {
  if (!KNOWN_PANEL_IDS.has(id)) return state;
  const pinned = state.pinned.includes(id)
    ? state.pinned.filter((item) => item !== id)
    : [id, ...state.pinned].slice(0, MAX_SHORTCUTS);
  return { ...state, pinned };
}

/** 置顶在前、最近在后，去重后最多 6 个 */
export function shortcutIds(state: SettingsShortcutState): string[] {
  const ids = [...state.pinned, ...state.recent].filter(
    (id, index, list) => KNOWN_PANEL_IDS.has(id) && list.indexOf(id) === index,
  );
  return ids.slice(0, MAX_SHORTCUTS);
}
