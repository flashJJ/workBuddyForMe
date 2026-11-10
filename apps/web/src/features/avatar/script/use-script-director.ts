/**
 * v3.0 剧本引擎 T0.7：PetStage 侧的 Director 接线。
 *
 * 开关 `WBFM_PET_SCRIPT=1`（构建期映射为 NEXT_PUBLIC_WBFM_PET_SCRIPT）开启后，
 * 有对应场景的触发键走 ScriptDirector；无场景仍回退旧 Resolver/ActionExecutor。
 * 帧推进复用 VrmCanvas 现有 rAF（onFrame），不新开循环；Live2D 暂不接入。
 */

'use client';

import * as React from 'react';
import {
  eventTriggerKey,
  type ExpressionTag,
  type InteractionEvent,
  type ScriptGesture,
} from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { VrmCueAdapter } from './adapters/vrm-adapter';
import {
  ScriptDirector,
  type CancelReason,
  type ScriptContext,
} from './director';
import { installPetScriptDebug } from './debug';
import { BUILT_IN_SCENE_REGISTRY, BUILT_IN_SCENES } from './scenes';

export const PET_SCRIPT_ENABLED = process.env.NEXT_PUBLIC_WBFM_PET_SCRIPT === '1';

/** PetStage 控制器的最小结构（VRM/Live2D 均结构兼容；缺失能力静默降级） */
export interface ScriptControllerHandle {
  playSquash?(): void;
  tap?(): void;
  flashExpression(tag: ExpressionTag, durationMs: number): void;
  setExpression?(tag: ExpressionTag): void;
  setGaze?(nx: number, ny: number): void;
  setSleeping?(sleeping: boolean): void;
  setFaceAway?(away: boolean): void;
  playGesture?(gesture: ScriptGesture, intensity?: number): boolean;
  playMotion?(motion: string, options?: { loop?: boolean; fadeMs?: number }): boolean;
}

export interface UseScriptDirectorOptions {
  enabled: boolean;
  getController: () => ScriptControllerHandle | null;
  showSubtitle: (key: MessageKey, durationMs?: number) => void;
  speakText?: (text: string, tts: boolean) => void;
  getPointer?: () => { x: number; y: number } | null;
}

export type ScriptCueContext = Omit<ScriptContext, 'random'>;

export interface ScriptDirectorHandle {
  enabled: boolean;
  /** 有场景则交给 Director 并返回 true；无场景返回 false（调用方回退旧路径） */
  playEvent(event: InteractionEvent, ctx: ScriptCueContext): boolean;
  onFrame(dtMs: number): void;
  cancel(reason: CancelReason): void;
}

export function useScriptDirector(options: UseScriptDirectorOptions): ScriptDirectorHandle {
  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  const adapter = React.useMemo(() => {
    const target = {
      playSquash: () => optionsRef.current.getController()?.playSquash?.(),
      tap: () => optionsRef.current.getController()?.tap?.(),
      flashExpression: (tag: ExpressionTag, durationMs: number) => {
        optionsRef.current.getController()?.flashExpression(tag, durationMs);
      },
      setExpression: (tag: ExpressionTag) =>
        optionsRef.current.getController()?.setExpression?.(tag),
      setGaze: (nx: number, ny: number) => optionsRef.current.getController()?.setGaze?.(nx, ny),
      setSleeping: (sleeping: boolean) =>
        optionsRef.current.getController()?.setSleeping?.(sleeping),
      setFaceAway: (away: boolean) => optionsRef.current.getController()?.setFaceAway?.(away),
      playGesture: (gesture: ScriptGesture, intensity?: number) =>
        optionsRef.current.getController()?.playGesture?.(gesture, intensity) ?? false,
      playMotion: (motion: string, opts?: { loop?: boolean; fadeMs?: number }) =>
        optionsRef.current.getController()?.playMotion?.(motion, opts) ?? false,
    };
    return new VrmCueAdapter({
      controller: target,
      showSubtitle: (key, ms) => optionsRef.current.showSubtitle(key, ms),
      speakText: (text, tts) => optionsRef.current.speakText?.(text, tts),
      getPointer: () => optionsRef.current.getPointer?.() ?? null,
    });
  }, []);

  const director = React.useMemo(
    () => new ScriptDirector({ scenes: BUILT_IN_SCENES, sink: adapter }),
    [adapter],
  );

  React.useEffect(() => () => director.dispose(), [director]);

  // T0.8：dev 下暴露只读观测入口，生产不挂载
  React.useEffect(() => {
    if (!options.enabled) return;
    return (
      installPetScriptDebug(
        director,
        BUILT_IN_SCENES.map((scene) => scene.id),
      ) ?? undefined
    );
  }, [director, options.enabled]);

  const playEvent = React.useCallback(
    (event: InteractionEvent, ctx: ScriptCueContext): boolean => {
      if (!optionsRef.current.enabled) return false;
      const trigger = eventTriggerKey(event);
      if (!trigger) return false;
      const scenes = BUILT_IN_SCENE_REGISTRY.byTrigger(trigger);
      if (scenes.length === 0) return false;
      const scriptCtx: ScriptContext = { ...ctx, random: Math.random };
      for (const scene of scenes) {
        if (director.play(scene.id, scriptCtx)) return true;
      }
      // 场景存在但被门控/冷却拒绝：视为已消费，不回退旧链（避免绕过新规则）
      return true;
    },
    [director],
  );

  const onFrame = React.useCallback((dtMs: number) => director.update(dtMs), [director]);
  const cancel = React.useCallback((reason: CancelReason) => director.cancel(reason), [director]);

  return React.useMemo(
    () => ({ enabled: options.enabled, playEvent, onFrame, cancel }),
    [options.enabled, playEvent, onFrame, cancel],
  );
}
