'use client';

import * as React from 'react';
import {
  MUSIC_SESSION_KEYS,
  MUSIC_STORAGE_KEYS,
  readMusicSessionSetting,
  readMusicSetting,
  writeMusicSessionSetting,
  writeMusicSetting,
} from './music-persistence';
import { clampMusicVolume, type MusicLoopMode } from './music-tracks';

export interface MusicPreferencesOptions {
  volume: number;
  loop: MusicLoopMode;
  currentId: string | null;
  playing: boolean;
  setVolume: (value: number) => void;
  setLoop: (value: MusicLoopMode) => void;
  setCurrentId: (value: string) => void;
  setPlaying: (value: boolean) => void;
  refreshLibrary: () => Promise<void>;
}

/** v4.2：音乐偏好（localStorage）与播放意图（sessionStorage）的读写 */
export function useMusicPreferences(options: MusicPreferencesOptions): void {
  const {
    volume,
    loop,
    currentId,
    playing,
    setVolume,
    setLoop,
    setCurrentId,
    setPlaying,
    refreshLibrary,
  } = options;
  const mountedRef = React.useRef(false);

  React.useEffect(() => {
    mountedRef.current = true;
    const savedVolume = readMusicSetting(MUSIC_STORAGE_KEYS.volume);
    if (savedVolume !== null) setVolume(clampMusicVolume(Number(savedVolume)));
    const savedLoop = readMusicSetting(MUSIC_STORAGE_KEYS.loop);
    if (savedLoop === 'all' || savedLoop === 'one' || savedLoop === 'off') setLoop(savedLoop);
    const savedTrack = readMusicSetting(MUSIC_STORAGE_KEYS.track);
    if (savedTrack) setCurrentId(savedTrack);
    // 舞台路由卸载后回到主窗，恢复上一轮播放意图
    if (readMusicSessionSetting(MUSIC_SESSION_KEYS.playing) === '1') setPlaying(true);
    void refreshLibrary();
  }, [refreshLibrary, setCurrentId, setLoop, setPlaying, setVolume]);

  React.useEffect(() => {
    if (mountedRef.current) writeMusicSetting(MUSIC_STORAGE_KEYS.volume, String(volume));
  }, [volume]);
  React.useEffect(() => {
    if (mountedRef.current) writeMusicSetting(MUSIC_STORAGE_KEYS.loop, loop);
  }, [loop]);
  React.useEffect(() => {
    if (mountedRef.current && currentId) {
      writeMusicSetting(MUSIC_STORAGE_KEYS.track, currentId);
    }
  }, [currentId]);
  React.useEffect(() => {
    if (mountedRef.current) {
      writeMusicSessionSetting(MUSIC_SESSION_KEYS.playing, playing ? '1' : '0');
    }
  }, [playing]);
}
