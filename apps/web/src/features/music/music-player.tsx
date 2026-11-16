'use client';

import * as React from 'react';
import {
  activeTrackQueue,
  clampMusicVolume,
  guessMusicMood,
  mergeMusicTracks,
  nextTrackIndex,
  prevTrackIndex,
  type MusicLoopMode,
  type MusicTrack,
} from './music-tracks';
import {
  deleteImportedMusic,
  listImportedMusic,
  saveImportedMusic,
} from './music-storage';
import { isAudioFile } from './music-persistence';
import { useMusicSource } from './music-source';
import { useMusicAudioSink } from './use-music-audio-sink';
import { useMusicPreferences } from './use-music-preferences';
import { audioDirector, useAudioDirector } from '../audio';

/** 播放错误：空曲库 / 待生成 / 内置文件缺失 / 自动播放拦截 / 解码失败 */
export type MusicError = 'empty' | 'pending' | 'missing' | 'blocked' | 'decode';

export interface MusicPlayerState {
  tracks: MusicTrack[];
  current: MusicTrack | null;
  playing: boolean;
  volume: number;
  loop: MusicLoopMode;
  time: number;
  duration: number;
  error: MusicError | null;
  importing: boolean;
  /** v4.2：全局静音来自 AudioDirector，剧场按钮共享同一状态 */
  muted: boolean;
  toggleMuted: () => void;
  playTrack: (id: string) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  cycleLoop: () => void;
  refreshLibrary: () => Promise<void>;
  importFiles: (files: File[]) => Promise<{ saved: number; skipped: string[] }>;
  removeTrack: (id: string) => Promise<void>;
  dismissError: () => void;
}

const MusicPlayerContext = React.createContext<MusicPlayerState | null>(null);

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [imported, setImported] = React.useState<MusicTrack[]>([]);
  const [currentId, setCurrentId] = React.useState<string | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [volume, setVolumeState] = React.useState(0.6);
  const [loop, setLoop] = React.useState<MusicLoopMode>('all');
  const [time, setTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [error, setError] = React.useState<MusicError | null>(null);
  const [importing, setImporting] = React.useState(false);
  const audioState = useAudioDirector();
  useMusicAudioSink(audioRef, volume, playing);

  const tracks = React.useMemo(() => mergeMusicTracks(imported), [imported]);
  const current = tracks.find((track) => track.id === currentId) ?? null;
  const { src, missing } = useMusicSource(current);

  const refreshLibrary = React.useCallback(async () => {
    setImported(await listImportedMusic());
  }, []);

  useMusicPreferences({
    volume,
    loop,
    currentId,
    playing,
    setVolume: setVolumeState,
    setLoop,
    setCurrentId,
    setPlaying,
    refreshLibrary,
  });

  React.useEffect(() => {
    setTime(0);
    setDuration(0);
  }, [current?.id]);

  React.useEffect(() => {
    if (missing) {
      setPlaying(false);
      setError('missing');
    }
  }, [missing]);

  React.useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = clampMusicVolume(volume * audioDirector.gainFor('music'));
    }
  }, [volume, src, audioState.muted, audioState.voiceActive]);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (!playing) {
      audio.pause();
      return;
    }
    void audio.play().catch(() => {
      setPlaying(false);
      setError('blocked');
    });
  }, [playing, src]);

  const playTrack = React.useCallback(
    (id: string) => {
      const track = tracks.find((item) => item.id === id);
      if (track?.pending) {
        setError('pending');
        return;
      }
      setCurrentId(id);
      setPlaying(true);
      setError(null);
    },
    [tracks],
  );

  const toggle = React.useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (current?.pending) {
      setError('pending');
      return;
    }
    if (!current && tracks[0]) setCurrentId(tracks[0].id);
    if (!current && !tracks[0]) {
      setError('empty');
      return;
    }
    setError(null);
    setPlaying(true);
  }, [playing, current, tracks]);

  const next = React.useCallback(() => {
    const queue = activeTrackQueue(tracks, current);
    const index = queue.findIndex((track) => track.id === currentId);
    const target = nextTrackIndex(index, queue.length, 'all');
    if (target === null) return;
    setCurrentId(queue[target]!.id);
    setError(null);
    setPlaying(true);
  }, [tracks, current, currentId]);

  const prev = React.useCallback(() => {
    const queue = activeTrackQueue(tracks, current);
    const index = queue.findIndex((track) => track.id === currentId);
    const target = prevTrackIndex(index, queue.length);
    if (target === null) return;
    setCurrentId(queue[target]!.id);
    setError(null);
    setPlaying(true);
  }, [tracks, current, currentId]);

  const seek = React.useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    audio.currentTime = Math.min(audio.duration || 0, Math.max(0, seconds));
    setTime(audio.currentTime);
  }, []);

  const setVolume = React.useCallback((value: number) => {
    setVolumeState(clampMusicVolume(value));
  }, []);

  const cycleLoop = React.useCallback(() => {
    setLoop((mode) => (mode === 'all' ? 'one' : mode === 'one' ? 'off' : 'all'));
  }, []);

  const importFiles = React.useCallback(
    async (files: File[]) => {
      setImporting(true);
      const skipped: string[] = [];
      let saved = 0;
      for (const file of files) {
        if (!isAudioFile(file)) {
          skipped.push(file.name);
          continue;
        }
        try {
          await saveImportedMusic(file, guessMusicMood(file.name));
          saved += 1;
        } catch {
          skipped.push(file.name);
        }
      }
      await refreshLibrary();
      setImporting(false);
      return { saved, skipped };
    },
    [refreshLibrary],
  );

  const removeTrack = React.useCallback(
    async (id: string) => {
      await deleteImportedMusic(id);
      if (id === currentId) {
        setPlaying(false);
        setCurrentId(null);
      }
      await refreshLibrary();
    },
    [currentId, refreshLibrary],
  );

  const onEnded = () => {
    const audio = audioRef.current;
    if (loop === 'one' && audio) {
      audio.currentTime = 0;
      void audio.play();
      return;
    }
    const queue = activeTrackQueue(tracks, current);
    const queueIndex = queue.findIndex((track) => track.id === currentId);
    const target = nextTrackIndex(queueIndex, queue.length, loop);
    if (target === null) {
      setPlaying(false);
      setTime(0);
      return;
    }
    setCurrentId(queue[target]!.id);
  };

  const value: MusicPlayerState = {
    tracks,
    current,
    playing,
    volume,
    loop,
    time,
    duration,
    error,
    importing,
    muted: audioState.muted,
    toggleMuted: () => audioDirector.toggleMuted(),
    playTrack,
    toggle,
    next,
    prev,
    seek,
    setVolume,
    cycleLoop,
    refreshLibrary,
    importFiles,
    removeTrack,
    dismissError: () => setError(null),
  };

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        src={src ?? undefined}
        preload="metadata"
        className="hidden"
        data-testid="music-audio"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onEnded={onEnded}
        onError={() => {
          setPlaying(false);
          setError(current?.source === 'builtin' ? 'missing' : 'decode');
        }}
      />
    </MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer(): MusicPlayerState {
  const context = React.useContext(MusicPlayerContext);
  if (!context) throw new Error('useMusicPlayer must be used inside MusicProvider');
  return context;
}
