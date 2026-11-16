'use client';

import * as React from 'react';
import { audioDirector } from '../audio';
import { clampMusicVolume } from './music-tracks';

/**
 * v4.2：把全局音乐注册为 `music` sink。
 * 音量 = 本地音量 × 导演系数；背景互斥时暂停，解锁回调负责重试播放。
 */
export function useMusicAudioSink(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  volume: number,
  playing: boolean,
): void {
  const volumeRef = React.useRef(volume);
  const playingRef = React.useRef(playing);
  volumeRef.current = volume;
  playingRef.current = playing;

  React.useEffect(() => {
    const audio = audioRef.current;
    const unregister = audioDirector.registerSink('music', {
      setGain(gain) {
        if (audioRef.current) audioRef.current.volume = clampMusicVolume(volumeRef.current * gain);
      },
      setSuspended(suspended) {
        const el = audioRef.current;
        if (!el) return;
        if (suspended) {
          el.pause();
          return;
        }
        if (playingRef.current) void el.play().catch(() => undefined);
      },
    });
    const unregisterUnlock = audioDirector.registerUnlock(() => {
      const el = audioRef.current;
      if (el && playingRef.current && el.paused) void el.play().catch(() => undefined);
    });
    audioDirector.setBackground('music');
    return () => {
      unregister();
      unregisterUnlock();
      audioDirector.setBackground(null);
      audio?.pause();
    };
  }, [audioRef]);
}
