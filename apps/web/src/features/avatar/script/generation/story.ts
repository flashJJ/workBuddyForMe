import type {
  PetScriptStoryMeta,
  PetScriptStorySummary,
} from '@wbfm/shared/schemas';

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
  recent: Array<{ sceneId: string; theme: string; tags: string[]; at: number }>;
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

/** 返回重复原因；null = 不重复 */
export function findDuplicate(
  state: StoryState,
  sceneId: string,
  meta: PetScriptStoryMeta,
): string | null {
  if (state.recent.some((entry) => entry.sceneId === sceneId)) return `场景 id 重复: ${sceneId}`;
  const theme = normalizeTheme(meta.theme);
  for (const entry of state.recent.slice(0, 10)) {
    if (normalizeTheme(entry.theme) === theme) return `主题与近期重复: ${meta.theme}`;
    const shared = meta.tags.filter((tag) => entry.tags.includes(tag)).length;
    if (shared >= 2) return `梗标签与近期重复: ${shared} 个`;
  }
  return null;
}

function unique(values: readonly string[], max: number): string[] {
  return [...new Set(values)].slice(0, max);
}

function findThread(
  threads: StoryThread[],
  pending: StoryState['cliffhanger'],
  meta: PetScriptStoryMeta,
): StoryThread | undefined {
  if (meta.resolves) {
    const target = normalizeTheme(meta.resolves);
    return (
      threads.find(
        (thread) =>
          thread.status === 'open' &&
          thread.cliffhanger !== null &&
          normalizeTheme(thread.cliffhanger) === target,
      ) ??
      threads.find(
        (thread) => thread.status === 'open' && normalizeTheme(thread.theme) === target,
      ) ??
      threads.find((thread) => thread.status === 'open')
    );
  }
  if (!pending) return undefined;
  return threads.find((thread) => thread.sceneIds.includes(pending.sceneId));
}

/** 把一次生成入账：续接/开线、更新悬念与梗标签 */
export function ingestStory(
  state: StoryState,
  sceneId: string,
  meta: PetScriptStoryMeta,
  at: number,
): StoryState {
  const threads = state.threads.map((thread) => ({ ...thread, sceneIds: [...thread.sceneIds] }));
  const existing = findThread(threads, state.cliffhanger, meta);
  const continues = Boolean(existing);
  const nextCliffhanger = meta.cliffhanger ?? null;

  if (existing) {
    existing.sceneIds.push(sceneId);
    existing.lastAt = at;
    existing.tags = unique([...existing.tags, ...meta.tags], 8);
    // resolves 表示本场把这条线收掉了；若本场又留下新悬念则续开
    if (meta.resolves) {
      existing.cliffhanger = nextCliffhanger;
      existing.status = nextCliffhanger ? 'open' : 'closed';
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
    { sceneId, theme: meta.theme, tags: [...meta.tags], at },
    ...state.recent,
  ].slice(0, MAX_RECENT);

  const cliffhanger = nextCliffhanger
    ? { text: nextCliffhanger, sceneId, at }
    : meta.resolves || continues
      ? null
      : state.cliffhanger;

  return {
    threads: threads.slice(0, MAX_THREADS),
    recent,
    cliffhanger,
    usedTags: unique([...meta.tags, ...state.usedTags], MAX_TAGS),
  };
}

export function storySummary(state: StoryState): PetScriptStorySummary {
  return {
    openThreads: state.threads.filter((thread) => thread.status === 'open').length,
    recentThemes: state.recent.slice(0, 5).map((entry) => entry.theme),
    cliffhanger: state.cliffhanger?.text ?? null,
    usedTags: state.usedTags.slice(0, 12),
  };
}

/** 拼进提示词：当前悬念 + 进行中的线 + 近期主题/梗 */
export function storyContextForPrompt(state: StoryState): string {
  const open = state.threads.filter((thread) => thread.status === 'open');
  if (!state.cliffhanger && open.length === 0 && state.recent.length === 0) {
    return '（暂无历史剧情，可以开一条新线）';
  }
  const lines: string[] = [];
  if (state.cliffhanger) {
    lines.push(
      `未收悬念：${state.cliffhanger.text}（续接时在 story.resolves 原样引用；也可以留新的 story.cliffhanger）`,
    );
  }
  if (open.length > 0) {
    lines.push(`进行中的线：${open.map((thread) => thread.title || thread.theme).join(' / ')}`);
  }
  if (state.recent.length > 0) {
    lines.push(`最近主题（不要重复）：${state.recent.slice(0, 5).map((entry) => entry.theme).join(' / ')}`);
  }
  if (state.usedTags.length > 0) {
    lines.push(`已用梗标签（避免复用）：${state.usedTags.slice(0, 10).join(' / ')}`);
  }
  return lines.join('\n');
}
