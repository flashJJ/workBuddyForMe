import { describe, expect, it } from 'vitest';
import { isVrmAvatarId } from '@wbfm/shared/schemas';
import {
  DEFAULT_THEATER_EPISODE_ID,
  GENRE_MOOD,
  THEATER_EPISODES,
  findTheaterEpisode,
  localizeTheaterEpisode,
  parseTheaterSearch,
  theaterActAt,
  theaterBackdropAt,
  theaterCastDirection,
  theaterDirections,
  theaterGenreAt,
  theaterMoodAt,
  theaterStepMs,
} from '../theater-script';

describe('小剧场内置剧本（M4）', () => {
  it('默认集存在，三席均为内置 VRM 且槽位唯一', () => {
    const episode = findTheaterEpisode();
    expect(episode.id).toBe(DEFAULT_THEATER_EPISODE_ID);
    expect(episode.cast).toHaveLength(3);
    expect(new Set(episode.cast.map((member) => member.slot)).size).toBe(3);
    for (const member of episode.cast) {
      expect(isVrmAvatarId(member.avatarModelId)).toBe(true);
    }
    expect(episode.cast.map((member) => member.displayName)).toEqual([
      '冉卡露丽',
      '雪团',
      '菲比',
    ]);
  });

  it('未知 ep 回落默认集，非法 ep 不落到别的集', () => {
    expect(findTheaterEpisode('missing').id).toBe(DEFAULT_THEATER_EPISODE_ID);
    expect(THEATER_EPISODES.length).toBeGreaterThanOrEqual(4);
    expect(THEATER_EPISODES.every((episode) => episode.lines.length > 0)).toBe(true);
  });

  it('每集类型标签齐全，幕区间连续覆盖全部台词', () => {
    for (const episode of THEATER_EPISODES) {
      expect(episode.genres.length).toBeGreaterThan(0);
      expect(GENRE_MOOD[episode.genres[0]!]).toBeTruthy();
      const acts = episode.acts ?? [];
      expect(acts.length).toBeGreaterThan(0);
      expect(acts[0]!.from).toBe(0);
      expect(acts.at(-1)!.to).toBe(episode.lines.length);
      for (let i = 1; i < acts.length; i += 1) {
        expect(acts[i]!.from).toBe(acts[i - 1]!.to);
      }
      for (const act of acts) {
        expect(act.to).toBeGreaterThan(act.from);
        expect(act.titleEn).toBeTruthy();
        expect(act.music).toBeTruthy();
      }
    }
  });

  it('幕切换推导背景、配乐情绪与类型标签', () => {
    const lateTea = findTheaterEpisode('late-tea-break');
    expect(theaterActAt(lateTea, 0)?.id).toBe('tea');
    expect(theaterBackdropAt(lateTea, 0)).toBe('curtain');
    expect(theaterMoodAt(lateTea, 0)).toBe('warm');
    expect(theaterGenreAt(lateTea, 0)).toBe('slice-of-life');
    expect(theaterMoodAt(lateTea, 3)).toBe('playful');
    expect(theaterGenreAt(lateTea, 3)).toBe('comedy');

    const rainy = findTheaterEpisode('rainy-wait');
    expect(theaterBackdropAt(rainy, 0)).toBe('spotlight');
    expect(theaterBackdropAt(rainy, 3)).toBe('none');
    expect(theaterMoodAt(rainy, 0)).toBe('melancholy');
    expect(theaterGenreAt(rainy, 0)).toBe('tragedy');
    expect(theaterMoodAt(rainy, 3)).toBe('warm');
    expect(theaterActAt(lateTea, lateTea.lines.length + 3)?.id).toBe('tomorrow');
  });

  it('第二集可直达，背景按集覆盖且与首集共用三席', () => {
    const first = findTheaterEpisode();
    const second = findTheaterEpisode('morning-drill');

    expect(second.id).toBe('morning-drill');
    expect(second.backdrop).toBe('spotlight');
    expect(first.backdrop).toBe('curtain');
    expect(second.cast).toEqual(first.cast);
    expect(second.lines).not.toEqual(first.lines);
  });

  it('en-US 下标题与台词走 textEn，中文原样', () => {
    const episode = findTheaterEpisode();
    const localized = localizeTheaterEpisode(episode, 'en-US');

    expect(localized.title).toBe(episode.titleEn);
    expect(localized.lines[0]!.text).toBe(episode.lines[0]!.textEn);
    expect(localized.lines[0]!.text).not.toBe(episode.lines[0]!.text);
    expect(localized.acts?.[0]!.title).toBe(episode.acts?.[0]!.titleEn);
    expect(localizeTheaterEpisode(episode, 'zh-CN')).toBe(episode);

    for (const item of THEATER_EPISODES) {
      expect(item.titleEn).toBeTruthy();
      expect(item.lines.every((line) => Boolean(line.textEn))).toBe(true);
    }
  });

  it('只认 stage=play，ep 做白名单校验', () => {
    expect(parseTheaterSearch('?stage=play')).toEqual({ theater: true, episodeId: null });
    expect(parseTheaterSearch('?stage=play&ep=late-tea-break')).toEqual({
      theater: true,
      episodeId: 'late-tea-break',
    });
    expect(parseTheaterSearch('?stage=run&ep=late-tea-break').theater).toBe(false);
    expect(parseTheaterSearch('?stage=play&ep=../etc').episodeId).toBeNull();
    expect(parseTheaterSearch('?stage=play&ep=UPPER').episodeId).toBeNull();
  });

  it('每句生成 focus + speech + expression + motion，越界回到首句', () => {
    const episode = findTheaterEpisode();
    const first = theaterDirections(episode, 0);
    expect(first[0]).toEqual({ t: 'focus', slot: episode.lines[0]!.slot });
    expect(first[1]).toMatchObject({ t: 'speech', seq: 0, text: episode.lines[0]!.text });
    expect(first.map((direction) => direction.t)).toEqual([
      'focus',
      'speech',
      'expression',
      'motion',
    ]);

    const wrapped = theaterDirections(episode, episode.lines.length);
    expect(wrapped[1]).toMatchObject({ t: 'speech', seq: 0 });
    expect(theaterDirections(episode, -1)[1]).toMatchObject({
      t: 'speech',
      seq: episode.lines.length - 1,
    });
  });

  it('表情强度随台词下发：显式 3/1，缺省 2', () => {
    const episode = findTheaterEpisode();
    const expressionOf = (index: number) =>
      theaterDirections(episode, index).find((direction) => direction.t === 'expression');

    expect(expressionOf(0)).toMatchObject({ tag: episode.lines[0]!.expression, intensity: 2 });
    expect(expressionOf(1)).toMatchObject({ tag: 'joy', intensity: 3 });
    expect(expressionOf(episode.lines.length - 1)).toMatchObject({ tag: 'smirk', intensity: 1 });
  });

  it('单句停留按文本长度估算并夹在 3.6–12s', () => {
    expect(theaterStepMs({ text: '短句' })).toBe(3600);
    expect(theaterStepMs({ text: '字'.repeat(20) })).toBe(5800);
    expect(theaterStepMs({ text: '长'.repeat(100) })).toBe(12000);
  });

  it('进入剧场先换 cast，首末句均由雪团收束', () => {
    const episode = findTheaterEpisode();
    expect(theaterCastDirection(episode)).toEqual({ t: 'cast', members: episode.cast });
    const lines = episode.lines;
    expect(lines[0]!.slot).toBe('center');
    expect(lines[lines.length - 1]!.slot).toBe('center');
  });
});
