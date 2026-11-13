import type { PetScriptStoryMeta } from '@wbfm/shared/schemas';

/**
 * P8.4：剧情状态机（纯函数 + 可注入存储）。
 *
 * 记录：未收线的线索、当前悬念、最近主题与梗标签。
 * 用途：生成前拼上下文（续接/避免重复）、生成后入账（收线/开新坑），
 * 让每次生成不是孤立小品，而是能接上一场的连续剧情。
 */

export const PET_SCRIPT_STORY_KEY = 'pet-script.story';
const MAX_THREADS = 8;
const MAX_RECENT = 20;
const MAX_TAGS = 30;
/** 同一条线索最多连续场次：到上限后本场必须用 resolves 收线 */
export const MAX_THREAD_SCENES = 3;
/** 母题去重回看：最近 N 场用过的道具不再复用（收线场除外） */
export const MOTIF_LOOKBACK = 2;

/** 本场用到的母题（道具/台词池），用于避免连续多场都是同一套东西 */
export interface StoryMotifs {
  props: string[];
  linePools: string[];
}

export interface StoryThread {
  id: string;
  title: string;
  theme: string;
  tags: string[];
  /** 未收悬念；null = 已收 */
  cliffhanger: string | null;
  sceneIds: string[];
  lastAt: number;
  status: 'open' | 'closed';
}

export interface StoryState {
  /** 最近在前 */
  threads: StoryThread[];
  recent: Array<{
    sceneId: string;
    theme: string;
    tags: string[];
    props: string[];
    linePools: string[];
    at: number;
  }>;
  cliffhanger: { text: string; sceneId: string; at: number } | null;
  usedTags: string[];
}

export interface PetScriptStoryStore {
  load(): unknown;
  save(state: StoryState): void;
}

export function emptyStoryState(): StoryState {
  return { threads: [], recent: [], cliffhanger: null, usedTags: [] };
}

function strings(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, max);
}

function numberOr(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 坏数据/旧版本一律回落到安全子集，不阻断生成 */
export function resolveStoryState(raw: unknown): StoryState {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const threads = Array.isArray(value.threads) ? value.threads.slice(0, MAX_THREADS) : [];
  const recent = Array.isArray(value.recent) ? value.recent.slice(0, MAX_RECENT) : [];
  const cliff = value.cliffhanger as Record<string, unknown> | null | undefined;
  return {
    threads: threads
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item): StoryThread => ({
        id: typeof item.id === 'string' ? item.id : 'thread.unknown',
        title: typeof item.title === 'string' ? item.title : '',
        theme: typeof item.theme === 'string' ? item.theme : '',
        tags: strings(item.tags, 8),
        cliffhanger: typeof item.cliffhanger === 'string' ? item.cliffhanger : null,
        sceneIds: strings(item.sceneIds, 20),
        lastAt: numberOr(item.lastAt),
        status: item.status === 'open' ? 'open' : 'closed',
      }))
      .filter((item) => item.id !== 'thread.unknown'),
    recent: recent
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        sceneId: typeof item.sceneId === 'string' ? item.sceneId : '',
        theme: typeof item.theme === 'string' ? item.theme : '',
        tags: strings(item.tags, 8),
        props: strings(item.props, 8),
        linePools: strings(item.linePools, 6),
        at: numberOr(item.at),
      }))
      .filter((item) => item.sceneId !== ''),
    cliffhanger:
      cliff && typeof cliff.text === 'string' && cliff.text.trim()
        ? {
            text: cliff.text,
            sceneId: typeof cliff.sceneId === 'string' ? cliff.sceneId : '',
            at: numberOr(cliff.at),
          }
        : null,
    usedTags: strings(value.usedTags, MAX_TAGS),
  };
}

/** 主题归一化：去空白/标点/符号并小写，用于判断「是不是同一个梗」 */
export function normalizeTheme(theme: string): string {
  return theme
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .slice(0, 40);
}

const EMPTY_MOTIFS: StoryMotifs = { props: [], linePools: [] };

/** 当前最需要续接的开放线索（resolves 命中优先，否则跟随全局悬念） */
export function openThreadToContinue(
  state: StoryState,
  meta: PetScriptStoryMeta,
): StoryThread | undefined {
  if (meta.resolves) {
    const target = normalizeTheme(meta.resolves);
    return (
      state.threads.find(
        (thread) =>
          thread.status === 'open' &&
          thread.cliffhanger !== null &&
          normalizeTheme(thread.cliffhanger) === target,
      ) ??
      state.threads.find(
        (thread) => thread.status === 'open' && normalizeTheme(thread.theme) === target,
      ) ??
      state.threads.find((thread) => thread.status === 'open')
    );
  }
  if (!state.cliffhanger) return undefined;
  return state.threads.find((thread) => thread.sceneIds.includes(state.cliffhanger!.sceneId));
}

/** 返回重复/超限原因；null = 可接受 */
export function findDuplicate(
  state: StoryState,
  sceneId: string,
  meta: PetScriptStoryMeta,
  motifs: StoryMotifs = EMPTY_MOTIFS,
): string | null {
  if (state.recent.some((entry) => entry.sceneId === sceneId)) return `场景 id 重复: ${sceneId}`;
  const theme = normalizeTheme(meta.theme);
  for (const entry of state.recent.slice(0, 10)) {
    if (normalizeTheme(entry.theme) === theme) return `主题与近期重复: ${meta.theme}`;
    const shared = meta.tags.filter((tag) => entry.tags.includes(tag)).length;
    if (shared >= 2) return `梗标签与近期重复: ${shared} 个`;
  }

  // 母题去重：最近 2 场用过的道具不再复用；resolves 收线场允许沿用（同一杯茶要收尾）
  if (!meta.resolves) {
    for (const entry of state.recent.slice(0, MOTIF_LOOKBACK)) {
      const repeated = motifs.props.find((prop) => entry.props.includes(prop));
      if (repeated) return `道具与近期重复: ${repeated}`;
    }
  }

  // 线索续接上限：已连续 MAX-1 场仍未收线时，本场必须 resolves
  if (!meta.resolves) {
    const open = state.threads.filter((thread) => thread.status === 'open');
    const latest = open.sort((a, b) => b.lastAt - a.lastAt)[0];
    if (latest && latest.sceneIds.length >= MAX_THREAD_SCENES - 1) {
      return `线索「${latest.title || latest.theme}」已连续 ${latest.sceneIds.length} 场，本场必须收线`;
    }
  }
  return null;
}

function unique(values: readonly string[], max: number): string[] {
  return [...new Set(values)].slice(0, max);
}

/** 把一次生成入账：续接/开线、更新悬念、梗标签与母题 */
export function ingestStory(
  state: StoryState,
  sceneId: string,
  meta: PetScriptStoryMeta,
  at: number,
  motifs: StoryMotifs = EMPTY_MOTIFS,
): StoryState {
  const threads = state.threads.map((thread) => ({ ...thread, sceneIds: [...thread.sceneIds] }));
  const existing = openThreadToContinue({ ...state, threads }, meta);
  const nextCliffhanger = meta.cliffhanger ?? null;

  if (existing) {
    existing.sceneIds.push(sceneId);
    existing.lastAt = at;
    existing.tags = unique([...existing.tags, ...meta.tags], 8);
    if (meta.resolves) {
      // 收旧线；若本场又留下新悬念，视为开一条新线（场次计数从本场重新开始）
      existing.cliffhanger = null;
      existing.status = 'closed';
      if (nextCliffhanger) {
        threads.unshift({
          id: `thread.${at}`,
          title: meta.title,
          theme: meta.theme,
          tags: [...meta.tags],
          cliffhanger: nextCliffhanger,
          sceneIds: [sceneId],
          lastAt: at,
          status: 'open',
        });
      }
    } else {
      existing.cliffhanger = nextCliffhanger ?? existing.cliffhanger;
      existing.status = existing.cliffhanger ? 'open' : 'closed';
    }
  } else {
    threads.unshift({
      id: `thread.${at}`,
      title: meta.title,
      theme: meta.theme,
      tags: [...meta.tags],
      cliffhanger: nextCliffhanger,
      sceneIds: [sceneId],
      lastAt: at,
      status: nextCliffhanger ? 'open' : 'closed',
    });
  }

  const recent = [
    {
      sceneId,
      theme: meta.theme,
      tags: [...meta.tags],
      props: [...motifs.props],
      linePools: [...motifs.linePools],
      at,
    },
    ...state.recent,
  ].slice(0, MAX_RECENT);

  const cliffhanger = nextCliffhanger
    ? { text: nextCliffhanger, sceneId, at }
    : meta.resolves
      ? null
      : state.cliffhanger;

  return {
    threads: threads.slice(0, MAX_THREADS),
    recent,
    cliffhanger,
    usedTags: unique([...meta.tags, ...state.usedTags], MAX_TAGS),
  };
}

