'use client';

import * as React from 'react';
import type { PetVoiceState } from '@wbfm/shared/pet';
import type {
  PetScriptPlaybackClaimResult,
  PetScriptPlaybackSummary,
  Scene,
} from '@wbfm/shared/schemas';
import { apiGet, apiPost } from '@/lib/api/client';
import type { ScriptDirectorHandle } from '../../use-script-director';

/**
 * P8.8：主动播放（客户端）。
 *
 * 桌宠空闲且无对话时，从生成队列里挑一场未播过的 gen.* 场景：
 * 先向服务端 claim 扣预算，再交给 ScriptDirector 演出；失败静默，绝不打断当前表演。
 * 空闲计时只看桌宠窗口内的指针活动与非 idle 语音，保持「用户在工作、桌宠自己玩」的语义。
 */

export const PLAYBACK_CHECK_MS = 30_000;
const SUMMARY_REFRESH_MS = 5 * 60_000;
const GENERATED_PREFIX = 'gen.';

export interface UseProactivePlaybackOptions {
  enabled: boolean;
  /** 可被打扰：语音空闲且不在勿扰时段 */
  canPlay: boolean;
  scenes: readonly Scene[];
  /** Director 是否已有场次在演 */
  isPlaying: () => boolean;
  playScene: (sceneId: string) => boolean;
  /** 睡眠中播放前先唤醒 */
  onBeforePlay?: () => void;
}

export interface ProactivePlaybackHandle {
  summary: PetScriptPlaybackSummary | null;
  markActivity: () => void;
  /** 立即判定一次；返回是否真正开演（dev/测试可用） */
  check: () => Promise<boolean>;
}

export function useProactivePlayback(
  options: UseProactivePlaybackOptions,
): ProactivePlaybackHandle {
  const optionsRef = React.useRef(options);
  optionsRef.current = options;
  const [summary, setSummary] = React.useState<PetScriptPlaybackSummary | null>(null);
  const summaryRef = React.useRef<PetScriptPlaybackSummary | null>(null);
  const lastActiveRef = React.useRef(Date.now());
  const claimingRef = React.useRef(false);
  const wasPlayableRef = React.useRef(options.canPlay);

  const markActivity = React.useCallback(() => {
    lastActiveRef.current = Date.now();
  }, []);

  const apply = React.useCallback((next: PetScriptPlaybackSummary) => {
    summaryRef.current = next;
    setSummary(next);
  }, []);

  const refresh = React.useCallback(async () => {
    if (!optionsRef.current.enabled) return;
    try {
      apply(await apiGet<PetScriptPlaybackSummary>('/api/pet/script/playback'));
    } catch {
      // 预算接口不可用时保持上一份快照；下一次刷新再试
    }
  }, [apply]);

  const check = React.useCallback(async (): Promise<boolean> => {
    const opts = optionsRef.current;
    if (!opts.enabled || !opts.canPlay || claimingRef.current || opts.isPlaying()) return false;
    const current = summaryRef.current;
    if (!current || current.perDay <= 0 || current.playsToday >= current.perDay) return false;
    if (Date.now() - lastActiveRef.current < current.idleMinutes * 60_000) return false;
    const played = new Set(current.playedSceneIds);
    const candidate = opts.scenes.find(
      (scene) => scene.id.startsWith(GENERATED_PREFIX) && !played.has(scene.id),
    );
    if (!candidate) return false;

    claimingRef.current = true;
    try {
      const result = await apiPost<PetScriptPlaybackClaimResult>(
        '/api/pet/script/playback/claim',
        { sceneId: candidate.id },
      );
      apply(result.playback);
      if (!result.ok) return false;
      opts.onBeforePlay?.();
      const started = opts.playScene(candidate.id);
      // 播放成功或失败都刷新空闲计时，避免同一窗口连续认领
      lastActiveRef.current = Date.now();
      return started;
    } catch {
      return false;
    } finally {
      claimingRef.current = false;
    }
  }, [apply]);

  React.useEffect(() => {
    if (!options.enabled) return;
    void refresh();
    const timer = setInterval(() => void refresh(), SUMMARY_REFRESH_MS);
    return () => clearInterval(timer);
  }, [options.enabled, refresh]);

  React.useEffect(() => {
    if (!options.enabled) return;
    const timer = setInterval(() => void check(), PLAYBACK_CHECK_MS);
    return () => clearInterval(timer);
  }, [options.enabled, check]);

  React.useEffect(() => {
    if (!options.enabled) return;
    const activity = () => markActivity();
    window.addEventListener('pointermove', activity, { passive: true });
    window.addEventListener('pointerdown', activity, { passive: true });
    return () => {
      window.removeEventListener('pointermove', activity);
      window.removeEventListener('pointerdown', activity);
    };
  }, [options.enabled, markActivity]);

  // 勿扰结束/说完话后重新计空闲，避免刚恢复可打扰就立刻演出
  React.useEffect(() => {
    if (!options.canPlay) {
      wasPlayableRef.current = false;
      return;
    }
    if (!wasPlayableRef.current) markActivity();
    wasPlayableRef.current = true;
  }, [options.canPlay, markActivity]);

  return { summary, markActivity, check };
}

export interface UsePetProactivePlaybackOptions {
  enabled: boolean;
  /** 语音空闲且不在勿扰时段 */
  canPlay: boolean;
  voiceState: PetVoiceState;
  scenes: readonly Scene[];
  script: ScriptDirectorHandle;
  /** 睡眠中播放前唤醒 */
  wake: () => void;
}

/**
 * 桌宠侧接线：语音非 idle 也算活动；播放前先唤醒睡眠。
 * 返回 markActivity 供触摸/中继事件调用。
 */
export function usePetProactivePlayback(options: UsePetProactivePlaybackOptions): () => void {
  const { enabled, canPlay, voiceState, scenes, script, wake } = options;
  const { markActivity } = useProactivePlayback({
    enabled,
    canPlay,
    scenes,
    isPlaying: script.isPlaying,
    playScene: script.playScene,
    onBeforePlay: wake,
  });

  React.useEffect(() => {
    if (voiceState !== 'idle') markActivity();
  }, [voiceState, markActivity]);

  return markActivity;
}
