/** 背景音乐：情绪标签、内置曲目槽位与播放顺序纯函数 */

export type MusicMood =
  | 'warm'
  | 'calm'
  | 'playful'
  | 'melancholy'
  | 'tense'
  | 'epic'
  | 'focus'
  | 'custom';

export type MusicSource = 'builtin' | 'imported';

/** 音乐许可：豆包 App 生成曲目仅个人使用；发布版应换 CC0/CC BY/商用授权 */
export type MusicLicense = 'personal-only' | 'cc0' | 'cc-by' | 'cc-by-nc' | 'commercial';

/** theme：主题曲组，播放时在组内轮播；atmosphere：氛围音乐 */
export type MusicGroup = 'theme' | 'atmosphere';

export interface MusicTrack {
  id: string;
  title: string;
  titleEn?: string;
  mood: MusicMood;
  source: MusicSource;
  group?: MusicGroup;
  license?: MusicLicense;
  /** v4.2：曲库入库响度基线；内置曲目统一 -16 LUFS，运行时只做相对音量 */
  loudnessLufs?: number;
  /** 槽位待补文件（不展示播放错误，直接标记待生成） */
  pending?: boolean;
  /** 内置曲目的静态地址 */
  src?: string;
  /** 导入曲目的原始文件名 */
  fileName?: string;
  size?: number;
  addedAt?: number;
}

/**
 * 内置曲目：全部来自 OpenGameArt 的 CC0 1.0 素材（可商用、可再分发、无需署名），
 * 文件已放入 `apps/web/public/audio/music/`，来源与作者见 ASSETS-LICENSE.md。
 * 主题曲组会在组内自动轮播。
 */
export const BUILTIN_TRACKS: readonly MusicTrack[] = [
  {
    id: 'theme-song-1',
    title: '梦的田野',
    titleEn: 'The Field of Dreams',
    mood: 'epic',
    source: 'builtin',
    group: 'theme',
    license: 'cc0',
    loudnessLufs: -16,
    src: '/audio/music/theme-song-1.mp3',
  },
  {
    id: 'theme-song-2',
    title: '决心',
    titleEn: 'Determination',
    mood: 'epic',
    source: 'builtin',
    group: 'theme',
    license: 'cc0',
    loudnessLufs: -16,
    src: '/audio/music/theme-song-2.mp3',
  },
  {
    id: 'theme-song-3',
    title: '塔防主题曲',
    titleEn: 'Tower Defense Theme',
    mood: 'epic',
    source: 'builtin',
    group: 'theme',
    license: 'cc0',
    loudnessLufs: -16,
    src: '/audio/music/theme-song-3.mp3',
  },
  {
    id: 'theme-warm',
    title: '新小镇',
    titleEn: 'A New Town',
    mood: 'warm',
    source: 'builtin',
    group: 'atmosphere',
    license: 'cc0',
    loudnessLufs: -16,
    src: '/audio/music/theme-warm.mp3',
  },
  {
    id: 'theme-warm-romance',
    title: '想告诉你的秘密',
    titleEn: 'A Secret to Tell You',
    mood: 'warm',
    source: 'builtin',
    group: 'atmosphere',
    license: 'cc0',
    loudnessLufs: -16,
    src: '/audio/music/theme-warm-romance.mp3',
  },
  {
    id: 'theme-calm',
    title: '草甸思绪',
    titleEn: 'Meadow Thoughts',
    mood: 'calm',
    source: 'builtin',
    group: 'atmosphere',
    license: 'cc0',
    loudnessLufs: -16,
    src: '/audio/music/theme-calm.mp3',
  },
  {
    id: 'theme-playful',
    title: '魔法小镇',
    titleEn: 'Magic Town',
    mood: 'playful',
    source: 'builtin',
    group: 'atmosphere',
    license: 'cc0',
    loudnessLufs: -16,
    src: '/audio/music/theme-playful.mp3',
  },
  {
    id: 'theme-playful-burst',
    title: '冒险时光',
    titleEn: 'Adventure Time',
    mood: 'playful',
    source: 'builtin',
    group: 'atmosphere',
    license: 'cc0',
    loudnessLufs: -16,
    src: '/audio/music/theme-playful-burst.mp3',
  },
  {
    id: 'theme-melancholy',
    title: '希望尽头',
    titleEn: 'At the End of Hope',
    mood: 'melancholy',
    source: 'builtin',
    group: 'atmosphere',
    license: 'cc0',
    loudnessLufs: -16,
    src: '/audio/music/theme-melancholy.mp3',
  },
  {
    id: 'theme-tense',
    title: '未解调查',
    titleEn: 'Unsolved Investigation',
    mood: 'tense',
    source: 'builtin',
    group: 'atmosphere',
    license: 'cc0',
    loudnessLufs: -16,
    src: '/audio/music/theme-tense.mp3',
  },
  {
    id: 'theme-focus',
    title: '生命波 2k',
    titleEn: 'Lifewave 2k',
    mood: 'focus',
    source: 'builtin',
    group: 'atmosphere',
    license: 'cc0',
    loudnessLufs: -16,
    src: '/audio/music/theme-focus.mp3',
  },
];

export function musicTrackTitle(track: MusicTrack, locale: string): string {
  return locale.toLowerCase().startsWith('en') ? track.titleEn ?? track.title : track.title;
}

export function formatMusicTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function clampMusicVolume(value: number): number {
  if (!Number.isFinite(value)) return 0.6;
  return Math.min(1, Math.max(0, value));
}

export type MusicLoopMode = 'all' | 'one' | 'off';

/** 下一首索引；空列表返回 null，`one` 也按顺序手动切歌 */
export function nextTrackIndex(
  current: number,
  length: number,
  loop: MusicLoopMode,
): number | null {
  if (length <= 0) return null;
  if (current < 0 || current >= length) return 0;
  if (loop === 'off' && current === length - 1) return null;
  return (current + 1) % length;
}

/** 上一首索引；空列表返回 null，始终循环 */
export function prevTrackIndex(current: number, length: number): number | null {
  if (length <= 0) return null;
  if (current <= 0 || current >= length) return length - 1;
  return current - 1;
}

/**
 * 当前曲目所属的播放队列：
 * 主题曲在主题曲组内轮播，氛围音乐与导入歌曲按整个曲库顺序播放。
 */
export function activeTrackQueue(
  tracks: readonly MusicTrack[],
  current: MusicTrack | null,
): MusicTrack[] {
  if (current?.group === 'theme') {
    const themes = tracks.filter((track) => track.group === 'theme');
    if (themes.length > 0) return themes;
  }
  return [...tracks];
}

/** 内置曲目在前、导入曲目在后；同 id 时导入项覆盖 */
export function mergeMusicTracks(imported: readonly MusicTrack[]): MusicTrack[] {
  const byId = new Map<string, MusicTrack>();
  for (const track of BUILTIN_TRACKS) byId.set(track.id, track);
  for (const track of imported) byId.set(track.id, track);
  return [...byId.values()];
}

/** 从文件名猜情绪，导入时给一个更贴近的默认标签 */
export function guessMusicMood(fileName: string): MusicMood {
  const name = fileName.toLowerCase();
  if (/(rain|sad|melancholy|雨|悲|伤)/.test(name)) return 'melancholy';
  if (/(night|calm|sleep|夜|安眠|静)/.test(name)) return 'calm';
  if (/(tense|mystery|suspense|悬疑|紧张)/.test(name)) return 'tense';
  if (/(epic|opening|main-theme|主题|开场)/.test(name)) return 'epic';
  if (/(comedy|playful|fun|喜剧|摸鱼|轻快)/.test(name)) return 'playful';
  if (/(focus|work|专注|工作)/.test(name)) return 'focus';
  return 'warm';
}
