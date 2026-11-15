import { useCallback, useEffect, useRef, useState } from 'react';
import type { StageDirection, StageSlot } from '@wbfm/shared/schemas';
import type { StageVoice } from '../voice/use-stage-voice';
import type { StageMotionCue } from './stage-motion-cue';
import type { TheaterEpisode, TheaterLine } from './theater-script';
import { theaterCastDirection, theaterDirections, theaterStepMs } from './theater-script';
import { stageMotionCue } from './stage-motion-adapter';
import { useTheaterAudio } from './use-theater-audio';
import { useTheaterPreload } from './use-theater-preload';
import { useTheaterReadiness } from './use-theater-readiness';

/** 空集/空句的兜底停留 */
export const THEATER_STEP_MS = 5200;
/** 语音卡住（自动播放拦截/解码异常）时最长等待，避免整场停在同一句 */
const MAX_SPEAK_HOLD_MS = 15000;

export interface StageTheaterState {
  index: number;
  total: number;
  playing: boolean;
  current: TheaterLine;
  /** 当前台词的舞台动作 cue（说话者执行） */
  cue: StageMotionCue;
  restart: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  bgmMuted: boolean;
  audioBlocked: boolean;
  toggleBgm: () => void;
  /** 三席 VRM 是否就绪（加载幕布据此关闭） */
  ready: boolean;
  readyCount: number;
  readyTotal: number;
  markActorReady: (slot: StageSlot) => void;
}

/**
 * 小剧场轮播：进入时换 cast，按句派发 StageDirection。
 * 每句停留由文本长度估算，语音播放期间继续等待，避免字幕与声音错位。
 */
export function useStageTheater(args: {
  enabled: boolean;
  episode: TheaterEpisode;
  applyDirection: (direction: StageDirection) => void;
  /** 传入后启用语音与 BGM；不传时只走纯字幕轮播 */
  voice?: StageVoice;
}): StageTheaterState {
  const { enabled, episode, applyDirection, voice } = args;
  const total = episode.lines.length;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hidden, setHidden] = useState(false);
  const current = episode.lines[index] ?? episode.lines[0]!;
  const readiness = useTheaterReadiness(episode.cast, enabled);
  useTheaterPreload(episode.cast, enabled);
  const audio = useTheaterAudio({
    enabled,
    playing,
    ready: readiness.ready,
    episode,
    line: current,
    index,
    voice,
  });

  // 语音播放中不推进，避免长句被下一句截断
  const speakingRef = useRef(false);
  speakingRef.current = Boolean(voice?.speaking);
  const speakingSinceRef = useRef<number | null>(null);

  // 窗口隐藏时暂停时间线，回前台重新计时，避免切后台继续跑台词
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    applyDirection(theaterCastDirection(episode));
    setIndex(0);
    setPlaying(true);
  }, [enabled, episode, applyDirection]);

  useEffect(() => {
    if (!enabled || !playing || !readiness.ready || hidden || total === 0) return;
    const line = episode.lines[index];
    const step = line ? theaterStepMs(line) : THEATER_STEP_MS;
    const startedAt = performance.now();
    speakingSinceRef.current = null;
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (speakingRef.current) {
        if (speakingSinceRef.current === null) speakingSinceRef.current = now;
        if (now - speakingSinceRef.current < MAX_SPEAK_HOLD_MS) return;
      } else {
        speakingSinceRef.current = null;
      }
      if (now - startedAt < step) return;
      window.clearInterval(timer);
      setIndex((current) => (current + 1) % total);
    }, 250);
    return () => window.clearInterval(timer);
  }, [enabled, playing, readiness.ready, hidden, index, total, episode]);

  useEffect(() => {
    if (!enabled) return;
    for (const direction of theaterDirections(episode, index)) {
      applyDirection(direction);
    }
  }, [enabled, episode, index, applyDirection]);

  const restart = useCallback(() => {
    setIndex(0);
    setPlaying(true);
  }, []);
  const toggle = useCallback(() => setPlaying((value) => !value), []);
  const next = useCallback(() => {
    setIndex((current) => (total === 0 ? 0 : (current + 1) % total));
  }, [total]);
  const prev = useCallback(() => {
    setIndex((current) => (total === 0 ? 0 : (current - 1 + total) % total));
  }, [total]);

  return {
    index,
    total,
    playing,
    current,
    cue: stageMotionCue(current),
    restart,
    toggle,
    next,
    prev,
    bgmMuted: audio.bgmMuted,
    audioBlocked: audio.audioBlocked,
    toggleBgm: audio.toggleBgm,
    ready: readiness.ready,
    readyCount: readiness.readyCount,
    readyTotal: readiness.total,
    markActorReady: readiness.markReady,
  };
}
