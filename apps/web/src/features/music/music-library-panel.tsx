'use client';

import * as React from 'react';
import { Music2, Pause, Play, SkipBack, SkipForward, Trash2, Upload } from 'lucide-react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useToast } from '@/components/common/toast';
import { MusicAtmospherePanel } from './music-atmosphere-panel';
import { MUSIC_MAX_BYTES } from './music-storage';
import { musicTrackTitle } from './music-tracks';
import { useMusicPlayer } from './music-player';

/** 设置中心「背景音乐」面板：内置槽位、导入歌曲与环境音清单 */
export function MusicLibraryPanel() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const player = useMusicPlayer();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = React.useState(false);

  const imported = player.tracks.filter((track) => track.source === 'imported');
  const themeTracks = player.tracks.filter(
    (track) => track.source === 'builtin' && track.group === 'theme',
  );
  const atmosphere = player.tracks.filter(
    (track) => track.source === 'builtin' && track.group !== 'theme',
  );
  const hasPersonalOnly = player.tracks.some((track) => track.license === 'personal-only');

  const onFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const result = await player.importFiles(files);
    if (result.saved > 0) {
      toast.success(t('music.panel.importSuccess', { count: result.saved }));
    }
    if (result.skipped.length > 0) {
      toast.error(t('music.panel.importSkipped', { count: result.skipped.length }));
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void onFiles([...(event.target.files ?? [])]);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    void onFiles([...event.dataTransfer.files]);
  };

  const onDelete = async (id: string) => {
    await player.removeTrack(id);
    toast.success(t('music.panel.deleteSuccess'));
  };

  const renderTrack = (id: string) => {
    const track = player.tracks.find((item) => item.id === id);
    if (!track) return null;
    const active = player.current?.id === track.id;
    const pending = track.pending === true;
    return (
      <li
        key={track.id}
        data-testid={`music-track-${track.id}`}
        className="flex items-center gap-2 rounded-md border px-2.5 py-2"
      >
        <button
          type="button"
          aria-label={pending ? t('music.panel.pending') : active && player.playing ? t('music.player.pause') : t('music.player.play')}
          disabled={pending}
          onClick={() => (active ? player.toggle() : player.playTrack(track.id))}
          className="rounded-full bg-primary/10 p-1.5 text-primary hover:bg-primary/20 disabled:opacity-40"
        >
          {active && player.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{musicTrackTitle(track, locale)}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {t(`music.moods.${track.mood}`)} · {t(`music.panel.source.${track.source}`)}
            {track.source === 'imported' && track.fileName ? ` · ${track.fileName}` : ''}
          </p>
        </div>
        {pending && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {t('music.panel.pending')}
          </span>
        )}
        {track.license === 'personal-only' && (
          <span
            title={t('music.panel.personalOnlyHint')}
            data-testid={`music-license-${track.id}`}
            className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400"
          >
            {t('music.panel.personalOnly')}
          </span>
        )}
        {track.license === 'cc0' && (
          <span
            title={t('music.panel.cc0Hint')}
            data-testid={`music-license-${track.id}`}
            className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400"
          >
            {t('music.panel.cc0')}
          </span>
        )}
        {active && player.playing && !pending && (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
            {t('music.panel.playing')}
          </span>
        )}
        {track.source === 'imported' && (
          <button
            type="button"
            aria-label={t('music.panel.delete')}
            onClick={() => void onDelete(track.id)}
            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="space-y-4 rounded-lg border bg-ui-card p-4" data-testid="music-library-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Music2 className="h-4 w-4 text-primary" />
            {t('music.panel.title')}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('music.panel.description')}</p>
          <p
            className={`mt-1 text-[11px] ${
              hasPersonalOnly ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'
            }`}
            data-testid="music-license-note"
          >
            {hasPersonalOnly ? t('music.panel.personalOnlyHint') : t('music.panel.cc0Hint')}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t('music.player.prev')}
            onClick={player.prev}
            className="rounded p-1.5 hover:bg-accent"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={player.playing ? t('music.player.pause') : t('music.player.play')}
            onClick={player.toggle}
            className="rounded-full bg-primary p-2 text-primary-foreground"
          >
            {player.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label={t('music.player.next')}
            onClick={player.next}
            className="rounded p-1.5 hover:bg-accent"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-lg border border-dashed p-3 text-xs ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border'
        }`}
        data-testid="music-import-dropzone"
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          data-testid="music-import-input"
          onChange={onInputChange}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={player.importing}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            {player.importing ? t('music.panel.importing') : t('music.panel.import')}
          </button>
          <span className="text-muted-foreground">
            {t('music.panel.importHint', { size: Math.round(MUSIC_MAX_BYTES / 1024 / 1024) })}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-medium text-muted-foreground">{t('music.panel.themeTitle')}</h4>
          <button
            type="button"
            data-testid="music-theme-rotate"
            onClick={() => themeTracks[0] && player.playTrack(themeTracks[0].id)}
            className="rounded-md border px-2 py-1 text-[11px] hover:bg-accent"
          >
            {t('music.panel.themeRotate')}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">{t('music.panel.themeHint')}</p>
        <ul className="space-y-1.5">{themeTracks.map((track) => renderTrack(track.id))}</ul>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground">{t('music.panel.atmosphereTitle')}</h4>
        <p className="text-[11px] text-muted-foreground">{t('music.panel.builtinHint')}</p>
        <ul className="space-y-1.5">{atmosphere.map((track) => renderTrack(track.id))}</ul>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground">{t('music.panel.importedTitle')}</h4>
        {imported.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="music-imported-empty">
            {t('music.panel.importedEmpty')}
          </p>
        ) : (
          <ul className="space-y-1.5">{imported.map((track) => renderTrack(track.id))}</ul>
        )}
      </div>

      {player.error && (
        <p className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {t(`music.errors.${player.error}`)}
        </p>
      )}

      <MusicAtmospherePanel />
    </section>
  );
}
