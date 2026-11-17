'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { cn } from '@/lib/utils';
import { formatMusicTime, musicTrackTitle } from './music-tracks';
import { useMusicPlayer } from './music-player';

/** 全局迷你播放条：主工作区右下角，进入舞台路由时随主布局一起卸载 */
export function MusicMiniPlayer() {
  const { t, locale } = useI18n();
  const player = useMusicPlayer();
  const [collapsed, setCollapsed] = React.useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label={t('music.player.expand')}
        data-testid="music-mini-player"
        onClick={() => setCollapsed(false)}
        className="app-glass-surface fixed bottom-4 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border bg-card text-primary shadow-lg"
      >
        <Music2 className="h-4 w-4" />
      </button>
    );
  }

  const current = player.current;
  const errorText = player.error ? t(`music.errors.${player.error}`) : null;
  const themeTracks = player.tracks.filter((track) => track.group === 'theme');
  const themeIndex =
    current?.group === 'theme' ? themeTracks.findIndex((track) => track.id === current.id) + 1 : 0;
  const subtitle = current
    ? [
        t(`music.moods.${current.mood}`),
        current.pending
          ? t('music.panel.pending')
          : current.group === 'theme'
            ? t('music.player.themeRotation', { index: themeIndex, total: themeTracks.length })
            : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : t('music.player.emptyHint');

  return (
    <section
      data-testid="music-mini-player"
      aria-label={t('music.player.title')}
      className="app-glass-surface fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-card/95 p-3 shadow-xl backdrop-blur"
    >
      <div className="flex items-center gap-2">
        <Music2 className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" data-testid="music-track-title">
            {current ? musicTrackTitle(current, locale) : t('music.player.empty')}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <Link
          href="/settings#panel-music-library"
          className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
        >
          {t('music.player.library')}
        </Link>
        <button
          type="button"
          aria-label={t('music.player.collapse')}
          className="rounded p-1 text-muted-foreground hover:bg-accent"
          onClick={() => setCollapsed(true)}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          aria-label={t('music.player.prev')}
          data-testid="music-prev"
          onClick={player.prev}
          className="rounded p-1.5 hover:bg-accent"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={player.playing ? t('music.player.pause') : t('music.player.play')}
          data-testid="music-toggle"
          onClick={player.toggle}
          disabled={current?.pending === true}
          className="rounded-full bg-primary p-2 text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {player.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          type="button"
          aria-label={t('music.player.next')}
          data-testid="music-next"
          onClick={player.next}
          className="rounded p-1.5 hover:bg-accent"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={t(`music.player.loop.${player.loop}`)}
          onClick={player.cycleLoop}
          className="rounded p-1.5 text-muted-foreground hover:bg-accent"
        >
          {player.loop === 'one' ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
        </button>
        <div className="ml-1 flex flex-1 items-center gap-1.5">
          <button
            type="button"
            aria-label={player.muted ? t('music.player.unmute') : t('music.player.mute')}
            data-testid="music-mute"
            onClick={player.toggleMuted}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent"
          >
            {player.muted ? (
              <VolumeX className="h-3.5 w-3.5" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={player.volume}
            aria-label={t('music.player.volume')}
            data-testid="music-volume"
            onChange={(event) => player.setVolume(Number(event.target.value))}
            className="h-1 w-full accent-primary"
          />
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{formatMusicTime(player.time)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(player.duration, 0.1)}
          step={0.5}
          value={Math.min(player.time, player.duration || 0)}
          aria-label={t('music.player.seek')}
          onChange={(event) => player.seek(Number(event.target.value))}
          className="h-1 flex-1 accent-primary"
        />
        <span className="tabular-nums">{formatMusicTime(player.duration)}</span>
      </div>

      {errorText && (
        <p className={cn('mt-1.5 rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive')}>
          {errorText}
        </p>
      )}
      {errorText && player.error === 'missing' && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          {t('music.errors.missingHint')}
        </p>
      )}
    </section>
  );
}
