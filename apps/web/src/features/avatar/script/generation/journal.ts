import {
  PET_SCRIPT_JOURNAL_MAX_RETENTION_DAYS,
  type PetScriptJournalDay,
  type PetScriptJournalItem,
  type PetScriptJournalSettings,
} from '@wbfm/shared/schemas';
import { localDateKey } from './state';

/**
 * P8.6：剧情日记（「她今天做了什么」的数据层）。
 *
 * - 只记录生成场景（gen.*）：生成时写标题/主题/触发键，播放时累加次数；
 * - settings_kv 单键持久化，保留天数可配置（默认 null = 永久保留）；
 * - 设置变化时立即按新保留期裁剪；全部为纯函数，坏数据逐条丢弃；
 * - 跨天不做清零，按 generatedAt 的本地日期分天查询。
 */

export const PET_SCRIPT_JOURNAL_KEY = 'pet-script.journal';
const DAY_MS = 24 * 60 * 60 * 1000;

export type PetScriptJournalSource = 'auto' | 'manual';

export interface PetScriptJournalState {
  /** 新→旧 */
  items: PetScriptJournalItem[];
  /** 保留天数；null = 永久保留（默认） */
  retentionDays: number | null;
}

export interface PetScriptJournalStore {
  load(): unknown;
  save(state: PetScriptJournalState): void;
}

export interface JournalGeneratedInput {
  sceneId: string;
  title: string;
  theme: string;
  trigger: string;
  source: PetScriptJournalSource;
  /** 生成时间（epoch ms） */
  at: number;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function timestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

/** 保留天数：非正整数或缺失都按「永久保留」处理 */
function retentionDays(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(PET_SCRIPT_JOURNAL_MAX_RETENTION_DAYS, Math.floor(value));
}

function resolveItem(raw: unknown): PetScriptJournalItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const sceneId = text(value.sceneId, 120);
  const generatedAt = timestamp(value.generatedAt);
  if (!sceneId || !generatedAt) return null;
  return {
    sceneId,
    title: text(value.title, 40) || sceneId,
    theme: text(value.theme, 80),
    trigger: text(value.trigger, 80),
    source: value.source === 'auto' ? 'auto' : 'manual',
    generatedAt,
    playedAt: timestamp(value.playedAt),
    playCount: typeof value.playCount === 'number' && value.playCount > 0 ? Math.floor(value.playCount) : 0,
  };
}

export function resolveJournal(raw: unknown): PetScriptJournalState {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const list = Array.isArray(value?.items) ? value.items : [];
  return {
    items: list
      .map(resolveItem)
      .filter((item): item is PetScriptJournalItem => item !== null)
      .sort((a, b) => b.generatedAt - a.generatedAt),
    retentionDays: retentionDays(value?.retentionDays),
  };
}

function prune(
  items: readonly PetScriptJournalItem[],
  now: number,
  days: number | null,
): PetScriptJournalItem[] {
  if (days === null) return [...items];
  const floor = now - days * DAY_MS;
  return items.filter((item) => item.generatedAt >= floor);
}

export function journalSettings(state: PetScriptJournalState): PetScriptJournalSettings {
  return { retentionDays: state.retentionDays };
}

/** 修改保留天数并立即按新保留期裁剪 */
export function setJournalRetention(
  state: PetScriptJournalState,
  days: unknown,
  now: number,
): PetScriptJournalState {
  const next = retentionDays(days);
  return { items: prune(state.items, now, next), retentionDays: next };
}

/** 生成成功：同 id 覆盖并置顶（重新生成的场景视为新记录） */
export function recordGenerated(
  state: PetScriptJournalState,
  input: JournalGeneratedInput,
  now = input.at,
): PetScriptJournalState {
  const item: PetScriptJournalItem = {
    sceneId: input.sceneId,
    title: input.title,
    theme: input.theme,
    trigger: input.trigger,
    source: input.source,
    generatedAt: input.at,
    playedAt: null,
    playCount: 0,
  };
  return {
    ...state,
    items: prune(
      [item, ...state.items.filter((entry) => entry.sceneId !== item.sceneId)],
      now,
      state.retentionDays,
    ),
  };
}

/** 播放上报：只累加已记录的场景；未记录（非生成场景或已过期）直接忽略 */
export function recordPlayed(
  state: PetScriptJournalState,
  sceneId: string,
  now: number,
): PetScriptJournalState {
  if (!state.items.some((item) => item.sceneId === sceneId)) return state;
  return {
    ...state,
    items: state.items.map((item) =>
      item.sceneId === sceneId
        ? { ...item, playedAt: now, playCount: item.playCount + 1 }
        : item,
    ),
  };
}

/** 某一天的回顾视图（按本地日期分桶） */
export function journalDay(state: PetScriptJournalState, date: string): PetScriptJournalDay {
  const items = state.items.filter(
    (item) => localDateKey(new Date(item.generatedAt)) === date,
  );
  return {
    date,
    items,
    generated: items.length,
    played: items.filter((item) => item.playCount > 0).length,
  };
}
