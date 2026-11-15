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
  type PetScriptDecisionReport,
  type Scene,
  type ScriptGesture,
} from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { apiPost } from '@/lib/api/client';
import { VrmCueAdapter } from './adapters/vrm-adapter';
import {
  decisionReportContext,
  orderTriggerCandidates,
  type TriggerDecisionExtras,
} from './utility';
import {
  ScriptDirector,
  type CancelReason,
  type ScriptContext,
} from './director';
import { getPetScriptDebug, installPetScriptDebug } from './debug';
import { createSceneRegistry } from './registry';
import { BUILT_IN_SCENES } from './scenes';
import { validateScenes } from './validation/validate';

export const PET_SCRIPT_ENABLED = process.env.NEXT_PUBLIC_WBFM_PET_SCRIPT === '1';

/** P8.6：生成场景开始播放时写日记；失败静默，绝不阻塞表演 */
function reportScriptPlay(sceneId: string): void {
  if (!sceneId.startsWith('gen.')) return;
  void apiPost('/api/pet/script/journal', { sceneId }).catch(() => {});
}

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
  /** P8：剧本动作专用槽（全身 + fade/loop，不占触摸反应）；缺失时回退 playMotion */
  playScriptMotion?(motion: string, options?: { loop?: boolean; fadeMs?: number }): boolean;
  stopScriptMotion?(motion?: string): boolean;
  /** M0c：L3 分层行为（behavior.*） */
  playBehavior?(behavior: string): boolean;
  /** P3：场景 cue 强制接管并清空行为队列 */
  playBehaviorNow?(behavior: string): boolean;
  /** P3：场景结束停行为（按 id 匹配；clearQueue 清空排队） */
  stopBehavior?(behavior?: string, clearQueue?: boolean): boolean;
  /** S3：手持道具 attach/detach */
  attachProp?(id: string, on?: boolean): Promise<boolean>;
  /** S4：场景道具 show/hide */
  showProp?(id: string, on?: boolean): Promise<boolean>;
  /** P8：剧本场次门控（抑制待机余兴/点击兜底） */
  setScriptBusy?(busy: boolean): void;
  /** T2.5：坐姿锚点（null 恢复站立） */
  setSeat?(mode: 'sill' | 'desk' | null): void;
}

export interface UseScriptDirectorOptions {
  /** 是否创建导演：开启后可在生产包手动播放内置场戏（右键菜单） */
  enabled: boolean;
  /**
   * 是否让导演接管普通交互触发（身体/头部点击等）。
   * 默认跟随 enabled；显式 false 时只保留手动 playScene，旧 Resolver 链路不变。
   */
  triggersEnabled?: boolean;
  getController: () => ScriptControllerHandle | null;
  showSubtitle: (key: MessageKey, durationMs?: number) => void;
  speakText?: (text: string, tts: boolean) => void;
  getPointer?: () => { x: number; y: number } | null;
  /** P8.3：生成场景（服务端已校验；这里再走一次白名单） */
  extraScenes?: readonly Scene[];
  /** M3 Utility：触发候选排序所需的粗粒度状态（工作信号/最近道具） */
  decisionContext?: () => TriggerDecisionExtras;
}

export type ScriptCueContext = Omit<ScriptContext, 'random'>;

export interface ScriptDirectorHandle {
  enabled: boolean;
  /** 有场景则交给 Director 并返回 true；无场景返回 false（调用方回退旧路径） */
  playEvent(event: InteractionEvent, ctx: ScriptCueContext): boolean;
  /** P3：dev 手动播放（干饭/被叫胖暂无触发键）；沿用最近一次事件上下文 */
  playScene(sceneId: string): boolean;
  /** P8.8：是否有场次在演（主动播放前避让） */
  isPlaying(): boolean;
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
        optionsRef.current.getController()?.playScriptMotion?.(motion, opts) ??
        optionsRef.current.getController()?.playMotion?.(motion, opts) ?? false,
      stopScriptMotion: (motion?: string) =>
        optionsRef.current.getController()?.stopScriptMotion?.(motion) ?? false,
      playBehavior: (behavior: string) =>
        optionsRef.current.getController()?.playBehavior?.(behavior) ?? false,
      playBehaviorNow: (behavior: string) =>
        optionsRef.current.getController()?.playBehaviorNow?.(behavior) ?? false,
      stopBehavior: (behavior?: string, clearQueue?: boolean) =>
        optionsRef.current.getController()?.stopBehavior?.(behavior, clearQueue) ?? false,
      attachProp: (id: string, on?: boolean) =>
        optionsRef.current.getController()?.attachProp?.(id, on) ?? Promise.resolve(false),
      showProp: (id: string, on?: boolean) =>
        optionsRef.current.getController()?.showProp?.(id, on) ?? Promise.resolve(false),
      setSeat: (mode: 'sill' | 'desk' | null) =>
        optionsRef.current.getController()?.setSeat?.(mode),
    };
    return new VrmCueAdapter({
      controller: target,
      showSubtitle: (key, ms) => optionsRef.current.showSubtitle(key, ms),
      speakText: (text, tts) => optionsRef.current.speakText?.(text, tts),
      getPointer: () => optionsRef.current.getPointer?.() ?? null,
    });
  }, []);

  const scenes = React.useMemo(() => {
    const result = validateScenes([
      ...BUILT_IN_SCENES,
      ...(options.extraScenes ?? []),
    ]);
    if (process.env.NODE_ENV !== 'production' && result.dropped.length > 0) {
      console.warn('[ScriptDirector] 已丢弃非法 cue:', result.dropped);
    }
    return result.scenes;
  }, [options.extraScenes]);
  /** 触发键索引跟随动态场景重建（生成场景也能被真实事件触发） */
  const registry = React.useMemo(() => createSceneRegistry(scenes), [scenes]);

  const directorRef = React.useRef<ScriptDirector | null>(null);
  /** 最近一次真实事件的上下文；dev 手动播放复用它，避免伪造门控状态 */
  const lastCtxRef = React.useRef<ScriptCueContext | null>(null);
  /** 同一触发键的候选场戏轮换游标：身体单击不会永远只演同一条 */
  const rotationRef = React.useRef<Record<string, number>>({});

  const fallbackCtx = React.useCallback(
    (): ScriptCueContext => ({
      hour: new Date().getHours(),
      relationshipLevel: 'stranger',
      mood: 'normal',
      emotionEnabled: true,
      linesEnabled: true,
      doNotDisturb: { enabled: false, startHour: 23, endHour: 6 },
      busy: false,
      sleeping: false,
      faceAway: false,
    }),
    [],
  );

  const playScene = React.useCallback(
    (sceneId: string): boolean => {
      if (!optionsRef.current.enabled) return false;
      const director = directorRef.current;
      if (!director) return false;
      const ctx = lastCtxRef.current ?? fallbackCtx();
      const started = director.play(sceneId, { ...ctx, random: Math.random });
      if (started) reportScriptPlay(sceneId);
      return started;
    },
    [fallbackCtx],
  );

  // StrictMode 会执行 setup → cleanup → setup：Director 必须在 effect 内创建，
  // 否则 memo 实例被首次 cleanup dispose 后，第二次 setup 会拿着废实例（play 恒 false）。
  React.useEffect(() => {
    if (!options.enabled) return;
    const director = new ScriptDirector({ scenes, sink: adapter });
    directorRef.current = director;
    const uninstall = installPetScriptDebug(
      director,
      scenes.map((scene) => scene.id),
      playScene,
    );
    return () => {
      uninstall?.();
      optionsRef.current.getController()?.setScriptBusy?.(false);
      director.dispose();
      if (directorRef.current === director) directorRef.current = null;
    };
  }, [adapter, options.enabled, playScene, scenes]);

  const playEvent = React.useCallback(
    (event: InteractionEvent, ctx: ScriptCueContext): boolean => {
      if (!optionsRef.current.enabled) return false;
      // 未开启触发接管时，普通交互继续走旧 Resolver；手动 playScene 不受影响
      if (optionsRef.current.triggersEnabled === false) return false;
      const director = directorRef.current;
      if (!director) return false;
      const trigger = eventTriggerKey(event);
      const debug = getPetScriptDebug();
      if (debug) {
        debug.events += 1;
        debug.lastTrigger = trigger;
      }
      if (!trigger) return director.getActive().length > 0;
      lastCtxRef.current = ctx;
      const candidates = registry.byTrigger(trigger);
      if (candidates.length === 0) return director.getActive().length > 0;
      const scriptCtx: ScriptContext = { ...ctx, random: Math.random };
      const extras: TriggerDecisionExtras = optionsRef.current.decisionContext?.() ?? {
        work: 'unknown',
        recentProps: [],
        recentThemes: [],
        usedTags: [],
        recentSceneIds: [],
        sceneMeta: {},
      };
      const { ordered, nextRotation, context } = orderTriggerCandidates(
        ctx,
        extras,
        candidates,
        rotationRef.current[trigger] ?? 0,
      );
      for (const item of ordered) {
        if (director.play(item.candidate.sceneId, scriptCtx)) {
          rotationRef.current[trigger] = nextRotation;
          if (debug) debug.handled += 1;
          reportScriptPlay(item.candidate.sceneId);
          void apiPost('/api/pet/script/decisions', {
            sceneId: item.candidate.sceneId,
            source: 'trigger',
            score: item.score,
            reasons: item.reasons,
            context: decisionReportContext(context),
          } satisfies PetScriptDecisionReport).catch(() => {});
          return true;
        }
      }
      // 场景存在但被门控/冷却拒绝：视为已消费，不回退旧链（避免绕过新规则）
      if (debug) debug.handled += 1;
      return true;
    },
    [registry],
  );

  const onFrame = React.useCallback((dtMs: number) => {
    const director = directorRef.current;
    if (!director) return;
    director.update(dtMs);
    optionsRef.current.getController()?.setScriptBusy?.(director.getActive().length > 0);
  }, []);
  const cancel = React.useCallback((reason: CancelReason) => directorRef.current?.cancel(reason), []);
  const isPlaying = React.useCallback(
    () => (directorRef.current?.getActive().length ?? 0) > 0,
    [],
  );

  return React.useMemo(
    () => ({ enabled: options.enabled, playEvent, playScene, isPlaying, onFrame, cancel }),
    [options.enabled, playEvent, playScene, isPlaying, onFrame, cancel],
  );
}
