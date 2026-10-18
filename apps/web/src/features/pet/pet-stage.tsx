'use client';

import * as React from 'react';
import { AvatarCanvasRouter } from '@/features/avatar/avatar-canvas-router';
import type { Live2dController } from '@/features/avatar/live2d-controller';
import { useHeadTouch, type TouchControllerLike } from '@/features/avatar/use-head-touch';
import { pulseReunionSignal } from '@/features/avatar/reunion-storage';
import type { PetVoiceState } from '@wbfm/shared/pet';
import type { MessageKey } from '@wbfm/shared/i18n';
import {
  buildInteractionGraph,
  DEFAULT_DO_NOT_DISTURB,
  relationshipLevelName,
  touchTriggerKey,
  type InteractionEvent,
  type MotionMood,
} from '@wbfm/shared/schemas';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSettings } from '@/lib/hooks/use-settings';
import { getPetBridge } from './pet-bridge';
import { TriggerBus } from '@/features/interaction/trigger-bus';
import { ActionExecutor } from '@/features/interaction/action-executor';
import { resolveInteraction } from '@wbfm/shared/schemas';
import { PetHitBody, PetHitHead } from './pet-hit-regions';

interface Props {
  modelId: string;
  expression: import('@/features/avatar/expression-parser').ExpressionTag;
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
  const bridge = getPetBridge();
  const controllerRef = React.useRef<Live2dController | null>(null);
  const [line, setLine] = React.useState<string>('');
  const lineTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showLine = React.useCallback((text: string, durationMs: number) => {
    setLine(text);
    if (lineTimerRef.current) clearTimeout(lineTimerRef.current);
    lineTimerRef.current = setTimeout(() => setLine(''), durationMs);
  }, []);

  React.useEffect(
    () => () => {
      if (lineTimerRef.current) clearTimeout(lineTimerRef.current);
    },
    [],
  );

  // M0: ActionExecutor 实例——绑定 controller + showLine
  const executorRef = React.useRef<ActionExecutor | null>(null);
  React.useEffect(() => {
    executorRef.current = new ActionExecutor({
      controllerRef: controllerRef as React.MutableRefObject<any>,
      showSubtitle: (key, ms) => showLine(t(key as MessageKey), ms ?? 3200),
    });
  }, [showLine, t]);

  // 互动短句开关（缺省开）；关闭后摸头只保留弹性/表情，久别不迎接
  const linesEnabled = settings?.interactionLinesEnabled !== false;
  const emotionEnabled = settings?.emotionEnabled !== false;
  // v2.2 勿扰时段（缺省开、23:00–06:00）；关闭后任何时段都可交互
  const dndEnabled = settings?.doNotDisturbEnabled !== false;
  const dndStartHour = settings?.doNotDisturbStartHour ?? DEFAULT_DO_NOT_DISTURB.startHour;
  const dndEndHour = settings?.doNotDisturbEndHour ?? DEFAULT_DO_NOT_DISTURB.endHour;
  // v2.3：交互动画图 = 用户覆盖条目（排前）+ 内置图（剔除被停用条目）
  const graphOverrides = settings?.interactionGraphOverrides;
  const graphDisabled = settings?.interactionGraphDisabledEntryIds;
  const interactionGraph = React.useMemo(
    () => buildInteractionGraph(graphOverrides, graphDisabled),
    [graphOverrides, graphDisabled],
  );

  // M1: lastTriggerAt 同时用于 Resolver 冷却闸门 + 生产环境影子兜底（键为 region::gesture）
  const lastTriggerAtRef = React.useRef<Record<string, number>>({});

  // M1: resolveAndDispatch 正式模式（生产环境也生效），旧 useHeadTouch 逐步退役
  const resolveAndDispatch = React.useCallback(
    (event: InteractionEvent) => {
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
      const chain = resolveInteraction(event, ctx, interactionGraph);
      // 更新冷却时间戳（按 region::gesture 记，双击不被单击冷却吃掉）
      if (event.kind === 'touch') {
        lastTriggerAtRef.current = {
          ...lastTriggerAtRef.current,
          [touchTriggerKey(event.region, event.gesture)]: Date.now(),
        };
      }
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
    ],
  );

  // 摸头短句：本地文案气泡（零模型调用、零 IPC），受短句开关门控
  const onHeadTouch = useHeadTouch(
    controllerRef as React.MutableRefObject<TouchControllerLike | null>,
    {
      onLine: (key: MessageKey) => {
        if (linesEnabled) showLine(t(key), 3200);
      },
    },
  );

  // v1.7 久别迎接收归主窗事件导演（唯一出口，禁止双播）：
  // 桌宠仅在指针重新进入窗口时发跨窗信号；主窗 storage 监听后自行判定/去重/演出。
  // 情绪/短句任一总开关关闭时不发信号。
  const lastReunionPulseRef = React.useRef(0);

  // 全域视线跟随（拖拽盒遮挡 canvas 宿主，故在舞台根层归一化喂指针）；
  // 指针重新进入窗口 → 节流发一次久别信号（人回到桌宠前的「被重新关注」信号）
  React.useEffect(() => {
    let inside = false;
    const onMove = (event: PointerEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w > 0 && h > 0) {
        controllerRef.current?.setGaze(
          (event.clientX / w - 0.5) * 2,
          (event.clientY / h - 0.5) * 2,
        );
      }
      if (!inside) {
        inside = true;
        if (linesEnabled && emotionEnabled) {
          const now = Date.now();
          if (now - lastReunionPulseRef.current >= 30_000) {
            lastReunionPulseRef.current = now;
            pulseReunionSignal(now);
          }
        }
      }
    };
    const onLeave = () => {
      inside = false;
    };
    window.addEventListener('pointermove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [linesEnabled, emotionEnabled]);

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
        />
      </div>

      <PetHitBody
        bridge={bridge}
        controllerRef={controllerRef}
        resolveAndDispatch={resolveAndDispatch}
      />
      <PetHitHead
        bridge={bridge}
        controllerRef={controllerRef}
        resolveAndDispatch={resolveAndDispatch}
      />

      {/* 字幕气泡：本地短句（摸头/久别）优先于语音中继字幕 */}
      <PetSubtitle text={line || subtitle} voiceState={voiceState} />
    </div>
  );
}

function PetSubtitle({ text, voiceState }: { text: string; voiceState: PetVoiceState }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[4%] flex justify-center px-4">
      <div
        className="max-w-[85%] rounded-xl border border-border/50 bg-background/85 px-3 py-1.5 text-center text-sm leading-relaxed text-foreground shadow-sm backdrop-blur-sm"
        data-testid="pet-subtitle"
        data-voice-state={voiceState}
      >
        {text}
      </div>
    </div>
  );
}
