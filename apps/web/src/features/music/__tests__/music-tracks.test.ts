import { describe, expect, it } from 'vitest';
import {
  BUILTIN_TRACKS,
  activeTrackQueue,
  clampMusicVolume,
  formatMusicTime,
  guessMusicMood,
  mergeMusicTracks,
  musicTrackTitle,
  nextTrackIndex,
  prevTrackIndex,
  type MusicTrack,
} from '../music-tracks';

const imported: MusicTrack = {
  id: 'imported-1',
  title: '我的主题曲',
  mood: 'warm',
  source: 'imported',
  fileName: 'theme.mp3',
};

describe('背景音乐曲库与播放顺序', () => {
  it('内置槽位齐全且 id 唯一', () => {
    expect(BUILTIN_TRACKS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(BUILTIN_TRACKS.map((track) => track.id)).size).toBe(BUILTIN_TRACKS.length);
    for (const track of BUILTIN_TRACKS) {
      expect(track.src?.startsWith('/audio/music/')).toBe(true);
      expect(track.titleEn).toBeTruthy();
    }
    expect(BUILTIN_TRACKS.filter((track) => track.group === 'theme')).toHaveLength(3);
    expect(BUILTIN_TRACKS.filter((track) => track.pending)).toHaveLength(0);
  });

  it('内置曲目全部为可分发 CC0', () => {
    expect(BUILTIN_TRACKS).toHaveLength(11);
    expect(BUILTIN_TRACKS.every((track) => track.license === 'cc0')).toBe(true);
  });

  it('主题曲在自己组内轮播，氛围音乐走整个曲库', () => {
    const theme = BUILTIN_TRACKS.find((track) => track.group === 'theme')!;
    const atmosphere = BUILTIN_TRACKS.find((track) => track.id === 'theme-warm')!;

    expect(activeTrackQueue([...BUILTIN_TRACKS], theme)).toHaveLength(3);
    expect(
      activeTrackQueue([...BUILTIN_TRACKS], theme).every((track) => track.group === 'theme'),
    ).toBe(true);
    expect(activeTrackQueue([...BUILTIN_TRACKS], atmosphere)).toHaveLength(BUILTIN_TRACKS.length);
  });

  it('内置曲目在前、导入曲目在后，同 id 覆盖', () => {
    const merged = mergeMusicTracks([imported]);
    expect(merged).toHaveLength(BUILTIN_TRACKS.length + 1);
    expect(merged[0]!.source).toBe('builtin');
    expect(merged.at(-1)).toBe(imported);

    const override: MusicTrack = { ...imported, id: BUILTIN_TRACKS[0]!.id, title: '覆盖' };
    expect(mergeMusicTracks([override])[0]!.title).toBe('覆盖');
  });

  it('列表循环与不循环的边界', () => {
    expect(nextTrackIndex(0, 3, 'all')).toBe(1);
    expect(nextTrackIndex(2, 3, 'all')).toBe(0);
    expect(nextTrackIndex(2, 3, 'off')).toBeNull();
    expect(nextTrackIndex(1, 3, 'one')).toBe(2);
    expect(nextTrackIndex(-1, 3, 'all')).toBe(0);
    expect(nextTrackIndex(0, 0, 'all')).toBeNull();
    expect(prevTrackIndex(0, 3)).toBe(2);
    expect(prevTrackIndex(2, 3)).toBe(1);
    expect(prevTrackIndex(0, 0)).toBeNull();
  });

  it('时间与音量格式化', () => {
    expect(formatMusicTime(0)).toBe('0:00');
    expect(formatMusicTime(65)).toBe('1:05');
    expect(formatMusicTime(-1)).toBe('0:00');
    expect(formatMusicTime(Number.NaN)).toBe('0:00');
    expect(clampMusicVolume(1.4)).toBe(1);
    expect(clampMusicVolume(-0.2)).toBe(0);
    expect(clampMusicVolume(Number.NaN)).toBe(0.6);
  });

  it('按文件名猜情绪，中英文件名都覆盖', () => {
    expect(guessMusicMood('midnight_night.mp3')).toBe('calm');
    expect(guessMusicMood('雨夜-独白.mp3')).toBe('melancholy');
    expect(guessMusicMood('mystery-theme.mp3')).toBe('tense');
    expect(guessMusicMood('opening-theme.mp3')).toBe('epic');
    expect(guessMusicMood('theme-warm.mp3')).toBe('warm');
    expect(guessMusicMood('theme-calm.mp3')).toBe('calm');
    expect(guessMusicMood('theme-melancholy.mp3')).toBe('melancholy');
    expect(guessMusicMood('摸鱼喜剧.mp3')).toBe('playful');
    expect(guessMusicMood('focus-work.mp3')).toBe('focus');
    expect(guessMusicMood('untitled.mp3')).toBe('warm');
  });

  it('英文界面回退到标题英文名', () => {
    const warm = BUILTIN_TRACKS.find((track) => track.id === 'theme-warm')!;
    expect(musicTrackTitle(warm, 'zh-CN')).toBe('新小镇');
    expect(musicTrackTitle(warm, 'en-US')).toBe('A New Town');
    expect(musicTrackTitle(imported, 'en-US')).toBe('我的主题曲');
  });
});
