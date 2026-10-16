'use client';

import * as React from 'react';
import { AvatarCanvasRouter } from '@/features/avatar/avatar-canvas-router';
import type { Live2dController } from '@/features/avatar/live2d-controller';
import { useHeadTouch, type TouchControllerLike } from '@/features/avatar/use-head-touch';
import { pulseReunionSignal } from '@/features/avatar/reunion-storage';
import type { PetVoiceState } from '@wbfm/shared/pet';
import type { MessageKey } from '@wbfm/shared/i18n';
import type { InteractionEvent } from '@wbfm/shared/schemas';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSettings } from '@/lib/hooks/use-settings';
import { getPetBridge, isPetBodyPoint } from './pet-bridge';
import { TriggerBus } from '@/features/interaction/trigger-bus';
import { ActionExecutor } from '@/features/interaction/action-executor';
import { resolveInteraction } from '@wbfm/shared/schemas';

interface Props {
  modelId: string;
  expression: import('@/features/avatar/expression-parser').ExpressionTag;
  voiceState: PetVoiceState;
  subtitle: string;
  getLevel: () => number;
}

/**
 * 桌宠舞台（透明窗满铺）。
 *
 * 分区（互斥，全部交给手势层，无 -webkit-app-region）：
 * - 身体盒 `-webkit-app-region: drag`：系统拖拽层吞指针事件，拖拽不触发 Live2D tap
 *   （v1.0 经验：drag 区的 click 派发不可靠）；
 * - 头部盒 no-drag：单击挥手/双击回主窗/右键菜单（v1.6 单击增加摸头弹性/表情/本地短句）。
 * v1.6 M5：久别迎接本地短句/表情、全域视线跟随、互动短句开关门控。
 */
export function PetStage({ modelId, expression, voiceState, subtitle, getLevel }: Props) {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const bridge = getPetBridge();
  const controllerRef = React.useRef<Live2dController | null>(null);
  const [line, setLine] = React.useState<string>('');
  const lineTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // M0: 三段式交互状态——头部按住判定
  const headPressStartPosRef = React.useRef<{ x: number; y: number; at: number }>({ x: 0, y: 0, at: 0 });
  const headPressMovedRef = React.useRef<boolean>(false);
  const headPressBridgeActiveRef = React.useRef<boolean>(false);
  const headLongPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // M1: body 区域手势判定（和 head 对齐：no-drag + 手动拖拽）
  const bodyPressStartRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const bodyPressMovedRef = React.useRef<boolean>(false);
  const bodyPressBridgeActiveRef = React.useRef<boolean>(false);
  const bodyLongPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const LONGPRESS_THRESHOLD_MS = 500;
  const DRAG_THRESHOLD_PX = 3;

  const showLine = React.useCallback((text: string, durationMs: number) => {
    setLine(text);
    if (lineTimerRef.current) clearTimeout(lineTimerRef.current);
    lineTimerRef.current = setTimeout(() => setLine(''), durationMs);
  }, []);

  React.useEffect(
    () => () => {
      if (lineTimerRef.current) clearTimeout(lineTimerRef.current);
      if (headLongPressTimerRef.current) clearTimeout(headLongPressTimerRef.current);
      if (bodyLongPressTimerRef.current) clearTimeout(bodyLongPressTimerRef.current);
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

  // M1: lastTriggerAt 同时用于 Resolver 冷却闸门 + 生产环境影子兜底
  const lastTriggerAtRef = React.useRef<Partial<Record<'head' | 'body', number>>>({});

  // M1: resolveAndDispatch 正式模式（生产环境也生效），旧 useHeadTouch 逐步退役
  const resolveAndDispatch = React.useCallback(
    (event: InteractionEvent) => {
      const relationshipLevel =
        (settings as any)?.relationshipLevel ?? 'stranger'; // 未开启关系等级时回落
      const ctx = {
        hour: new Date().getHours(),
        capabilities: {
          hasTapClip: Boolean((controllerRef.current as any)?.tapClip),
          hasSpringBone: false,
        },
        lastTriggerAt: lastTriggerAtRef.current,
        relationshipLevel,
        emotionEnabled,
      };
      const chain = resolveInteraction(event, ctx);
      // 更新冷却时间戳
      if (event.kind === 'touch') {
        lastTriggerAtRef.current = {
          ...lastTriggerAtRef.current,
          [event.region]: Date.now(),
        };
      }
      if (chain) {
        executorRef.current?.dispatch(chain);
      }
      // 始终 emit 到 TriggerBus（M1 打通）
      TriggerBus.emit(event);
    },
    [settings, emotionEnabled],
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
        />
      </div>

      {/* 身体互动盒（底部 62%）：no-drag + 手动拖拽 + 纯点击动作（M1） */}
      <div
        data-testid="pet-hitbody"
        style={
          {
            WebkitAppRegion: 'no-drag',
            left: '15%',
            right: '15%',
            top: '38%',
            bottom: '0',
          } as React.CSSProperties
        }
        className="absolute cursor-grab"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          bodyPressStartRef.current = { x: e.clientX, y: e.clientY };
          bodyPressMovedRef.current = false;
          bodyPressBridgeActiveRef.current = false;
          // body-touch 程序化 start（让角色提前进入 phase='start'，等待后续判定）
          (controllerRef.current as any)?.startInteraction?.('body-touch');
          bodyLongPressTimerRef.current = setTimeout(() => {
            if (!bodyPressMovedRef.current) {
              resolveAndDispatch({ kind: 'touch', region: 'body', gesture: 'longpress' });
            }
          }, LONGPRESS_THRESHOLD_MS);
        }}
        onPointerMove={(e) => {
          const start = bodyPressStartRef.current;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
            bodyPressMovedRef.current = true;
            if (bodyLongPressTimerRef.current) {
              clearTimeout(bodyLongPressTimerRef.current);
              bodyLongPressTimerRef.current = null;
            }
            if (!bodyPressBridgeActiveRef.current) {
              bodyPressBridgeActiveRef.current = true;
              bridge?.dragBegin();
              // 进入拖拽模式 → 取消 body-touch 交互状态
              (controllerRef.current as any)?.endInteraction?.();
            }
          }
        }}
        onClick={() => {
          // 纯点击（pointerdown → pointerup 间 move ≤ 3px）→ body-touch
          if (!bodyPressBridgeActiveRef.current) {
            resolveAndDispatch({ kind: 'touch', region: 'body', gesture: 'tap' });
          }
        }}
        onPointerUp={() => {
          if (bodyPressBridgeActiveRef.current) {
            bridge?.dragEnd();
            bodyPressBridgeActiveRef.current = false;
          } else {
            (controllerRef.current as any)?.endInteraction?.();
          }
          if (bodyLongPressTimerRef.current) {
            clearTimeout(bodyLongPressTimerRef.current);
            bodyLongPressTimerRef.current = null;
          }
        }}
        onPointerCancel={() => {
          if (bodyPressBridgeActiveRef.current) {
            bridge?.dragEnd();
            bodyPressBridgeActiveRef.current = false;
          }
          (controllerRef.current as any)?.endInteraction?.();
          if (bodyLongPressTimerRef.current) {
            clearTimeout(bodyLongPressTimerRef.current);
            bodyLongPressTimerRef.current = null;
          }
        }}
      />

      {/* 头部互动盒（上部 27%）：no-drag + 单击摸头 / 长按持续 loop / 拖拽移动 / 双击回主窗 / 右键菜单 */}
      <div
        data-testid="pet-hithead"
        style={
          {
            WebkitAppRegion: 'no-drag',
            left: '15%',
            right: '15%',
            top: '11%',
            height: '27%',
          } as React.CSSProperties
        }
        className="absolute z-10 cursor-pointer"
        title={t('pet.stage.headHint')}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          headPressStartPosRef.current = { x: e.clientX, y: e.clientY, at: performance.now() };
          headPressMovedRef.current = false;
          headPressBridgeActiveRef.current = false;
          (controllerRef.current as any)?.startInteraction?.('head-touch');
          if (headLongPressTimerRef.current) clearTimeout(headLongPressTimerRef.current);
          headLongPressTimerRef.current = setTimeout(() => {
            if (!headPressMovedRef.current && !headPressBridgeActiveRef.current) {
              resolveAndDispatch({ kind: 'touch', region: 'head', gesture: 'longpress' });
            }
          }, LONGPRESS_THRESHOLD_MS);
        }}
        onPointerMove={(e) => {
          const start = headPressStartPosRef.current;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
            headPressMovedRef.current = true;
            if (headLongPressTimerRef.current) {
              clearTimeout(headLongPressTimerRef.current);
              headLongPressTimerRef.current = null;
            }
            // head 区域也支持拖拽移动窗口
            if (!headPressBridgeActiveRef.current) {
              headPressBridgeActiveRef.current = true;
              bridge?.dragBegin();
              (controllerRef.current as any)?.endInteraction?.();
            }
          }
        }}
        onClick={() => {
          // M1: 新管道主力——旧 useHeadTouch 退役（保留文件但不再被调用）
          resolveAndDispatch({ kind: 'touch', region: 'head', gesture: 'tap' });
          // 旧链路 fallback（deprecated，M1 仍保留 1 次调用兜底，M2 可删）
          onHeadTouch();
        }}
        onPointerUp={() => {
          (controllerRef.current as any)?.endInteraction?.();
          if (headPressBridgeActiveRef.current) {
            bridge?.dragEnd();
            headPressBridgeActiveRef.current = false;
          }
          if (headLongPressTimerRef.current) {
            clearTimeout(headLongPressTimerRef.current);
            headLongPressTimerRef.current = null;
          }
        }}
        onPointerCancel={() => {
          (controllerRef.current as any)?.endInteraction?.();
          if (headPressBridgeActiveRef.current) {
            bridge?.dragEnd();
            headPressBridgeActiveRef.current = false;
          }
          if (headLongPressTimerRef.current) {
            clearTimeout(headLongPressTimerRef.current);
            headLongPressTimerRef.current = null;
          }
        }}
        onDoubleClick={() => bridge?.focusMain()}
        onContextMenu={(event) => {
          event.preventDefault();
          bridge?.showMenu();
        }}
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
