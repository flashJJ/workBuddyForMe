'use client';

import * as React from 'react';
import {
  AvatarCanvasRouter,
  MotionPreviewOverlay,
  PET_SCRIPT_ENABLED,
  ScriptDebugPanel,
  useGeneratedScripts,
  usePetProactivePlayback,
  useScriptDirector,
  useAvatarChibi,
} from '@/features/avatar';
import type { Live2dController } from '@/features/avatar';
import type { PetVoiceState } from '@wbfm/shared/pet';
import type { MessageKey } from '@wbfm/shared/i18n';
import {
  buildInteractionGraph,
  DEFAULT_DO_NOT_DISTURB,
  isDoNotDisturbHour,
  isVrmAvatarId,
  relationshipLevelName,
  touchTriggerKey,
  type InteractionEvent,
  type MotionMood,
} from '@wbfm/shared/schemas';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSettings, useSettingsSync } from '@/lib/hooks/provider';
import { getPetBridge } from './pet-bridge';
import { usePetSize } from './stage/settings/use-pet-size';
import { ActionExecutor, TriggerBus } from '@/features/interaction';
import { resolveInteraction } from '@wbfm/shared/schemas';
import { aggregateWorkSignals, type PetWorkView } from '@wbfm/shared';
import { PetHitBody, PetHitHead } from './pet-hit-regions';
import { PetWorkBubble, isWorkBubbleVisible, type WorkBubbleMode } from './pet-work-bubble';
import { useWorkSignals } from './use-work-signals';
import { useWorkAlerts } from './use-work-alerts';
import { usePetFrameMode } from './stage/use-pet-frame-mode';
import { usePetSleep } from './stage/use-pet-sleep';
import { reportPetUiRect, usePetHitProxy } from './stage/hit-proxy';
import { PetSubtitleBubble } from './stage/pet-subtitle-bubble';
import { usePetAmbientTalk } from './stage/use-pet-ambient-talk';
import { usePetFaceAway } from './stage/use-pet-face-away';
import { usePetPointerGaze } from './stage/use-pet-pointer-gaze';
import { usePetCompanion } from './stage/companion';
import { usePetPropDebug } from './stage/debug/use-pet-prop-debug';

interface Props {
  modelId: string;
  expression: import('@/features/avatar').ExpressionTag;
  voiceState: PetVoiceState;
  subtitle: string;
  getLevel: () => number;
  /** v2.2：主窗经 IPC 中继的展示关系等级 0–3（交互门控真源） */
  relationshipLevel: number;
  /** v2.2：情绪档位（待机动作挑选） */
  mood: MotionMood;
}

/**
 * 桌宠舞台（透明窗满铺）。
 *
 * 分区（互斥，全部交给手势层，无 -webkit-app-region）：
 * - 身体盒 `-webkit-app-region: drag`：系统拖拽层吞指针事件，拖拽不触发 Live2D tap
 *   （v1.0 经验：drag 区的 click 派发不可靠）；
 * - 头部盒 no-drag：单击挥手/双击回主窗/右键菜单（v1.6 单击增加摸头弹性/表情/本地短句）。
 * 两个命中盒实体在 pet-hit-regions.tsx，本组件只做接线与舞台合成。
 * v1.6 M5：久别迎接本地短句/表情、全域视线跟随、互动短句开关门控。
 */
export function PetStage({
  modelId,
  expression,
  voiceState,
  subtitle,
  getLevel,
  relationshipLevel,
  mood,
}: Props) {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const petSize = usePetSize();
  const chibi = useAvatarChibi();
  // 主窗保存设置后立即拉取新值：勿扰/互动短句等开关不再需要重开桌宠才生效
  useSettingsSync();
  const bridge = getPetBridge();
  const controllerRef = React.useRef<Live2dController | null>(null); usePetPropDebug(controllerRef);
  // v3.0 P0：帧率档位 + 模型命中轮廓上报；P1：10min 无交互入睡
  const frameMode = usePetFrameMode(voiceState);
  const sleep = usePetSleep(voiceState); const sleeping = sleep.sleeping;
  // v3.5：久无交互背对 / 点击或说话转回
  const faceAway = usePetFaceAway(voiceState);
  const onModelRect = usePetHitProxy(bridge); const generated = useGeneratedScripts(PET_SCRIPT_ENABLED && isVrmAvatarId(modelId));
  const onScriptPanelRect = React.useCallback((rect: { x: number; y: number; width: number; height: number } | null) => reportPetUiRect(rect, bridge), [bridge]);
  const [line, setLine] = React.useState<string>(''); const lineTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showLine = React.useCallback((text: string, durationMs: number) => {
    setLine(text);
    if (lineTimerRef.current) clearTimeout(lineTimerRef.current);
    lineTimerRef.current = setTimeout(() => setLine(''), durationMs);
  }, []);

  React.useEffect(() => () => { if (lineTimerRef.current) clearTimeout(lineTimerRef.current); }, []);

  // 互动短句开关（缺省开）；关闭后摸头只保留弹性/表情，久别不迎接
  const linesEnabled = settings?.interactionLinesEnabled !== false;
  const emotionEnabled = settings?.emotionEnabled !== false;
  // v2.2 勿扰时段（缺省开、23:00–06:00）；关闭后任何时段都可交互
  const dndEnabled = settings?.doNotDisturbEnabled !== false;
  const dndStartHour = settings?.doNotDisturbStartHour ?? DEFAULT_DO_NOT_DISTURB.startHour;
  const dndEndHour = settings?.doNotDisturbEndHour ?? DEFAULT_DO_NOT_DISTURB.endHour;

  // M0: ActionExecutor 实例——绑定 controller + showLine（台词开关关闭时只执行动作）
  const executorRef = React.useRef<ActionExecutor | null>(null);
  React.useEffect(() => {
    executorRef.current = new ActionExecutor({
      controllerRef: controllerRef as React.MutableRefObject<any>,
      showSubtitle: (key, ms) => {
        if (!linesEnabled) return;
        showLine(t(key as MessageKey), ms ?? 3200);
      },
    });
  }, [showLine, t, linesEnabled]);

  // v3.0 T0.7：剧本开关（仅 VRM；关闭时完全走旧 Resolver/ActionExecutor）
  const script = useScriptDirector({
    enabled: PET_SCRIPT_ENABLED && isVrmAvatarId(modelId),
    getController: () => controllerRef.current, extraScenes: generated.scenes,
    showSubtitle: (key, ms) => { if (!linesEnabled) return; showLine(t(key), ms ?? 3200); },
  });

  // v3.0 M1：首次见面问候 + 右键快捷动作（静音/主动说话/干饭/炸毛）
  usePetCompanion({ linesEnabled, script, showLine, t });
  const inDnd = isDoNotDisturbHour(new Date().getHours(), {
    enabled: dndEnabled,
    startHour: dndStartHour,
    endHour: dndEndHour,
  });
  // P8.8：空闲主动播放（扣预算 → 唤醒 → 演出）；交互时刷新空闲计时。
  // M3 Utility 需要工作信号，调用点移到 workView 之后。
  usePetAmbientTalk({
    enabled: linesEnabled && !inDnd,
    sleeping,
    voiceState,
    t,
    speak: showLine,
  });
  // v2.3：交互动画图 = 用户覆盖条目（排前）+ 内置图（剔除被停用条目）
  const graphOverrides = settings?.interactionGraphOverrides;
  const graphDisabled = settings?.interactionGraphDisabledEntryIds;
  const interactionGraph = React.useMemo(
    () => buildInteractionGraph(graphOverrides, graphDisabled),
    [graphOverrides, graphDisabled],
  );

  // v2.7：工作汇报（独立于主窗页面的 SSE）
  const workEnabled = settings?.workSignalEnabled !== false;
  const workMode = (settings?.workBubbleMode ?? 'auto') as WorkBubbleMode;
  const work = useWorkSignals(workEnabled);
  const workConnected = work.snapshot ? work.connected : true;
  const workView = React.useMemo<PetWorkView>(() => {
    const view = aggregateWorkSignals(work.snapshot?.signals ?? [], work.snapshot?.approvals ?? []);
    return workEnabled && work.snapshot && !work.connected ? { ...view, base: 'disconnected', pulse: null } : view;
  }, [work.snapshot, work.connected, workEnabled]);
  useWorkAlerts(work.snapshot, settings);
  const workVisible = isWorkBubbleVisible(workView, workMode, workEnabled, workConnected);
  // M3 Utility：工作信号只压成 idle/busy/unknown 三态，驱动主动播放选场
  const decisionWork = workView.base === 'disconnected' ? 'unknown' : workView.base === 'idle' || workView.base === 'success' || workView.base === 'error' ? 'idle' : 'busy';
  const markActivity = usePetProactivePlayback({
    enabled: PET_SCRIPT_ENABLED && isVrmAvatarId(modelId), canPlay: voiceState === 'idle' && !inDnd,
    voiceState, scenes: generated.scenes, script, wake: sleep.wake,
    relationshipLevel, mood, work: decisionWork, recentProps: generated.story?.recentProps ?? [],
  });

  // M1: lastTriggerAt 同时用于 Resolver 冷却闸门 + 生产环境影子兜底（键为 region::gesture）
  const lastTriggerAtRef = React.useRef<Record<string, number>>({});

  // M1: resolveAndDispatch 正式模式（生产环境也生效），旧 useHeadTouch 逐步退役
  const resolveAndDispatch = React.useCallback(
    (event: InteractionEvent) => {
      markActivity();
      const ctx = {
        hour: new Date().getHours(),
        capabilities: {
          hasTapClip: Boolean((controllerRef.current as any)?.tapClip),
          hasSpringBone: false,
        },
        lastTriggerAt: lastTriggerAtRef.current,
        // v2.2：真源是主窗经 IPC 中继的展示关系等级（数值 0–3），不再读不存在的 settings 字段
        relationshipLevel: relationshipLevelName(relationshipLevel),
        emotionEnabled,
        mood,
        doNotDisturb: { enabled: dndEnabled, startHour: dndStartHour, endHour: dndEndHour },
      };
      // 更新冷却时间戳（按 region::gesture 记，双击不被单击冷却吃掉）
      if (event.kind === 'touch') {
        lastTriggerAtRef.current = {
          ...lastTriggerAtRef.current,
          [touchTriggerKey(event.region, event.gesture)]: Date.now(),
        };
      }
      // v3.0 T0.7：有对应场景时优先走 Director；返回 false 表示无场景 → 回退旧链
      if (
        script.playEvent(event, {
          hour: ctx.hour,
          relationshipLevel: ctx.relationshipLevel,
          mood: ctx.mood,
          emotionEnabled,
          linesEnabled,
          doNotDisturb: ctx.doNotDisturb,
          busy: voiceState !== 'idle',
          sleeping,
          faceAway,
        })
      ) {
        TriggerBus.emit(event);
        return;
      }
      const chain = resolveInteraction(event, ctx, interactionGraph);
      if (chain) {
        executorRef.current?.dispatch(chain);
      }
      // 始终 emit 到 TriggerBus（M1 打通）
      TriggerBus.emit(event);
    },
    [
      relationshipLevel,
      emotionEnabled,
      mood,
      dndEnabled,
      dndStartHour,
      dndEndHour,
      interactionGraph,
      script,
      voiceState,
      sleeping,
      faceAway,
      linesEnabled,
      markActivity,
    ],
  );

  // P2-2：接收主窗中继来的非触摸交互事件（感知 / 系统信号 / 关系变化），走同一条 Resolver 管道。
  // 用 ref 持有最新 dispatch，订阅只建立一次（避免依赖变化反复解绑/重绑 IPC 监听）。
  const resolveAndDispatchRef = React.useRef(resolveAndDispatch);
  resolveAndDispatchRef.current = resolveAndDispatch;
  React.useEffect(() => {
    const b = getPetBridge();
    if (!b) return;
    return b.onPerformance((event) => {
      if (event.kind === 'interaction') resolveAndDispatchRef.current(event.event);
    });
  }, []);

  // 全域视线跟随 + 指针重新进入窗口的节流久别信号（实现见 use-pet-pointer-gaze）
  usePetPointerGaze({ controllerRef, enabled: linesEnabled && emotionEnabled });

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent">
      <div className="absolute inset-0">
        <AvatarCanvasRouter
          modelId={modelId}
          expression={expression}
          getLevel={getLevel}
          speaking={voiceState === 'speaking'}
          controllerRef={controllerRef}
          interactive={true}
          mood={mood}
          relationshipLevel={relationshipLevel}
          frameMode={frameMode}
          sleeping={sleeping}
          faceAway={faceAway}
          petSize={petSize}
          chibi={chibi}
          onModelRect={onModelRect}
          onFrame={script.onFrame}
        />
      </div>

      <PetHitBody bridge={bridge} controllerRef={controllerRef} resolveAndDispatch={resolveAndDispatch} />
      <PetHitHead bridge={bridge} controllerRef={controllerRef} resolveAndDispatch={resolveAndDispatch} focusPath={workView.primary?.deepLink} />
      <PetWorkBubble
        view={workView}
        mode={workMode}
        enabled={workEnabled}
        connected={workConnected}
        reduceMotion={settings?.workReduceMotion === true}
      />

      {/* 字幕气泡：本地短句（摸头/久别）优先于语音中继字幕 */}
      <PetSubtitleBubble text={line || subtitle} voiceState={voiceState} shifted={workVisible} />
      {process.env.NEXT_PUBLIC_WBFM_MOTION_PREVIEW === '1' && <MotionPreviewOverlay controllerRef={controllerRef} />}
      {PET_SCRIPT_ENABLED && <ScriptDebugPanel onRectChange={onScriptPanelRect} onGenerate={generated.generate} generating={generated.loading} generationMessage={generated.message} usage={generated.usage} story={generated.story} schedule={generated.schedule} onToggleSchedule={generated.toggleSchedule} />}
    </div>
  );
}
