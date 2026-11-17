'use client';

import * as React from 'react';
import type { StageVoice } from '../voice/use-stage-voice';
import type { TheaterEpisode, TheaterLine } from './theater-script';
import { theaterGenreAt, theaterMoodAt } from './theater-script';
import { TheaterBgm } from './theater-bgm';
import { playTheaterSfx, setTheaterSfxOutputDevice, unlockTheaterSfx } from './theater-sfx';
import { audioDirector, useAudioDirector } from '../../audio';

export interface TheaterAudioState {
  bgmMuted: boolean;
  /** 浏览器自动播放策略拦截了背景音，等用户手势 */
  audioBlocked: boolean;
  toggleBgm: () => void;
}

/**
 * 小剧场音频编排：
 * - 每句台词按角色声线合成并播放，切句/暂停/退出立即取消；
 * - BGM 进入剧场淡入，说话时 duck 到 35%，退出或暂停淡出；
 * - 首次用户手势解锁 AudioContext（浏览器自动播放策略）。
 */
export function useTheaterAudio(args: {
  enabled: boolean;
  playing: boolean;
  /** 模型就绪前不开口、不放 BGM，避免幕布后先出声 */
  ready: boolean;
  episode: TheaterEpisode;
  line: TheaterLine;
  index: number;
  voice?: StageVoice;
}): TheaterAudioState {
  const { enabled, playing, ready, episode, line, index, voice } = args;
  const speak = voice?.speak;
  const stop = voice?.stop;
  const bgmRef = React.useRef<TheaterBgm | null>(null);
  const sfxStartedRef = React.useRef(false);
  const sfxLineRef = React.useRef<number | null>(null);
  const mood = theaterMoodAt(episode, index);
  const genre = theaterGenreAt(episode, index);
  const { muted } = useAudioDirector();
  const [blocked, setBlocked] = React.useState(false);

  React.useEffect(() => {
    const bgm = new TheaterBgm();
    bgmRef.current = bgm;
    const unregister = audioDirector.registerSink('theater-bgm', {
      setGain: (gain) => bgm.setGain(gain),
      setOutputDevice: (deviceId) => bgm.setOutputDevice(deviceId),
    });
    const unregisterSfx = audioDirector.registerSink('sfx', {
      setGain: () => undefined,
      setOutputDevice: setTheaterSfxOutputDevice,
    });
    const unregisterUnlock = audioDirector.registerUnlock(unlockTheaterSfx);
    audioDirector.setBackground('theater-bgm');
    return () => {
      unregister();
      unregisterSfx();
      unregisterUnlock();
      audioDirector.setBackground(null);
      bgm.dispose();
      bgmRef.current = null;
    };
  }, []);

  const startBgm = React.useCallback(() => {
    void bgmRef.current?.start().then((ok) => setBlocked(!ok));
  }, []);

  // 幕/剧集切换配乐情绪（运行中平滑换和弦）
  React.useEffect(() => {
    bgmRef.current?.setMood(mood);
  }, [mood]);

  // 进入/暂停：BGM 跟随演出状态；静音由导演统一压到 0
  React.useEffect(() => {
    if (enabled && playing && ready) startBgm();
    else bgmRef.current?.stop();
  }, [enabled, playing, ready, startBgm]);

  // 短音效：开场幕布一次，之后每次换句一声轻提示；静音与 BGM 同步

  React.useEffect(() => {
    if (!enabled) {
      sfxStartedRef.current = false;
      sfxLineRef.current = null;
      return;
    }
    if (!ready) return;
    if (!sfxStartedRef.current) {
      sfxStartedRef.current = true;
      sfxLineRef.current = index;
      if (playing && !muted) void playTheaterSfx('curtain');
      return;
    }
    if (sfxLineRef.current === index) return;
    sfxLineRef.current = index;
    if (playing && !muted) void playTheaterSfx('line', genre);
  }, [enabled, ready, playing, muted, index, genre]);

  // 逐句 TTS：切句由 speak 内部先取消上一句，失败时只有字幕不弹错
  React.useEffect(() => {
    if (!enabled || !speak) return;
    if (!playing || !ready) {
      stop?.();
      return;
    }
    const member = episode.cast.find((m) => m.slot === line.slot);
    void speak(line.text, member?.avatarModelId ?? '', member?.voicePreference?.speakerSid);
  }, [enabled, playing, ready, index, episode, line.slot, line.text, speak, stop]);

  // 切后台停声；回前台恢复 BGM，并补播当前句（时间线会重新计时）
  React.useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.hidden) {
        stop?.();
        bgmRef.current?.stop();
        return;
      }
      if (!playing || !ready) return;
      if (!muted) startBgm();
      const member = episode.cast.find((m) => m.slot === line.slot);
      void speak?.(line.text, member?.avatarModelId ?? '', member?.voicePreference?.speakerSid);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled, playing, ready, muted, episode, line.slot, line.text, speak, stop, startBgm]);

  const toggleBgm = React.useCallback(() => {
    // 被自动播放策略拦截时，第一次点击只负责解锁，不切静音
    if (blocked) {
      startBgm();
      return;
    }
    audioDirector.toggleMuted();
  }, [blocked, startBgm]);

  return { bgmMuted: muted, audioBlocked: blocked, toggleBgm };
}
