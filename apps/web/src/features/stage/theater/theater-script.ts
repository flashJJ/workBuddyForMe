import type { StageDirection } from '@wbfm/shared/schemas';
import { DEFAULT_THEATER_EPISODE_ID, THEATER_EPISODES } from './episodes';
import type {
  TheaterAct,
  TheaterBackdropVariant,
  TheaterEpisode,
  TheaterGenre,
  TheaterLine,
  TheaterMusicMood,
} from './episodes/types';

/**
 * v3.0 M4：小剧场内置剧本（纯数据 + 纯函数）。
 *
 * 三席全部使用内置 VRM 角色（雪团 / 冉卡露丽 / 菲比），
 * 舞台沿用 StageDirection 执行链，不新增渲染分支。
 * 剧集数据在 `episodes/`；本文件只保留查找、导演映射与幕/配乐推导。
 */
export { DEFAULT_THEATER_EPISODE_ID, THEATER_EPISODES };
export type {
  TheaterAct,
  TheaterBackdropVariant,
  TheaterEpisode,
  TheaterGenre,
  TheaterLine,
  TheaterMusicMood,
};

/** 类型标签 → 缺省配乐情绪（剧集/幕可用 music 显式覆盖） */
export const GENRE_MOOD: Record<TheaterGenre, TheaterMusicMood> = {
  comedy: 'playful',
  'slice-of-life': 'warm',
  tragedy: 'melancholy',
  mystery: 'tense',
};

function wrapIndex(index: number, total: number): number {
  if (total === 0) return 0;
  return ((index % total) + total) % total;
}

export function findTheaterEpisode(id?: string | null): TheaterEpisode {
  return (
    THEATER_EPISODES.find((episode) => episode.id === id) ??
    THEATER_EPISODES.find((episode) => episode.id === DEFAULT_THEATER_EPISODE_ID) ??
    THEATER_EPISODES[0]!
  );
}

/** `?stage=play&ep=late-tea-break`：只认 play，ep 非法时回落默认集 */
export function parseTheaterSearch(search: string): {
  theater: boolean;
  episodeId: string | null;
} {
  const params = new URLSearchParams(search);
  const theater = params.get('stage') === 'play';
  const raw = params.get('ep');
  const episodeId = raw && /^[a-z0-9-]{1,40}$/.test(raw) ? raw : null;
  return { theater, episodeId };
}

/** 当前句所属的幕；无 acts 或越界无匹配时返回 null */
export function theaterActAt(episode: TheaterEpisode, index: number): TheaterAct | null {
  if (!episode.acts?.length) return null;
  const safe = wrapIndex(index, episode.lines.length);
  return episode.acts.find((act) => safe >= act.from && safe < act.to) ?? null;
}

/** 当前句应使用的剧场背景：幕覆盖 > 剧集 > 幕布 */
export function theaterBackdropAt(
  episode: TheaterEpisode,
  index: number,
): TheaterBackdropVariant {
  return theaterActAt(episode, index)?.backdrop ?? episode.backdrop ?? 'curtain';
}

/** 当前句应使用的配乐情绪：幕覆盖 > 剧集 > 首个类型标签 > warm */
export function theaterMoodAt(episode: TheaterEpisode, index: number): TheaterMusicMood {
  const act = theaterActAt(episode, index);
  return (
    act?.music ??
    episode.music ??
    GENRE_MOOD[episode.genres[0] ?? 'slice-of-life']
  );
}

/** 当前句的类型标签：幕覆盖 > 剧集首个标签 */
export function theaterGenreAt(episode: TheaterEpisode, index: number): TheaterGenre | null {
  return theaterActAt(episode, index)?.genre ?? episode.genres[0] ?? null;
}

/** 按语言替换标题、幕名与台词；en-US 缺省项回落中文 */
export function localizeTheaterEpisode(episode: TheaterEpisode, locale: string): TheaterEpisode {
  if (!locale.toLowerCase().startsWith('en')) return episode;
  return {
    ...episode,
    title: episode.titleEn ?? episode.title,
    lines: episode.lines.map((line) => (line.textEn ? { ...line, text: line.textEn } : line)),
    acts: episode.acts?.map((act) => ({ ...act, title: act.titleEn ?? act.title })),
  };
}

/**
 * 单句最短停留：按文本长度估算，接入语音后由 speaking 状态再延长。
 * 短句不抢话（3.6s 下限），长句留出朗读时间（12s 上限）。
 */
export function theaterStepMs(line: Pick<TheaterLine, 'text'>): number {
  const chars = Array.from(line.text).length;
  return Math.min(12000, Math.max(3600, 2400 + chars * 170));
}

/** 单句 → 指令序列；index 越界回到第 0 句 */
export function theaterDirections(episode: TheaterEpisode, index: number): StageDirection[] {
  const total = episode.lines.length;
  const safe = total === 0 ? 0 : ((index % total) + total) % total;
  const line = episode.lines[safe];
  if (!line) return [];
  return [
    { t: 'focus', slot: line.slot },
    { t: 'speech', slot: line.slot, text: line.text, seq: safe },
    { t: 'expression', slot: line.slot, tag: line.expression, intensity: line.expressionIntensity ?? 2 },
    { t: 'motion', slot: line.slot, group: line.motion },
  ];
}

/** 与 `theaterDirections` 配套：进入剧场时先换 cast */
export function theaterCastDirection(episode: TheaterEpisode): StageDirection {
  return { t: 'cast', members: episode.cast };
}
