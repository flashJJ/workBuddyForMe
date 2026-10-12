'use client';

import * as React from 'react';
import { Live2dCanvas } from '@/features/avatar/live2d-canvas';
import type { Live2dController } from '@/features/avatar/live2d-controller';
import { useHeadTouch, type TouchControllerLike } from '@/features/avatar/use-head-touch';
import { REUNION_EXPRESSION_MS, REUNION_LINE_MS } from '@wbfm/shared/constants';
import type { PetVoiceState } from '@wbfm/shared/pet';
import type { MessageKey } from '@wbfm/shared/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSettings } from '@/lib/hooks/use-settings';
import { useReunionGreeting } from '@/features/avatar/use-reunion-greeting';
import { getPetBridge, isPetBodyPoint } from './pet-bridge';

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

  // 互动短句开关（缺省开）；关闭后摸头只保留弹性/表情，久别不迎接
  const linesEnabled = settings?.interactionLinesEnabled !== false;
  const emotionEnabled = settings?.emotionEnabled !== false;

  // 摸头短句：本地文案气泡（零模型调用、零 IPC），受短句开关门控
  const onHeadTouch = useHeadTouch(
    controllerRef as React.MutableRefObject<TouchControllerLike | null>,
    {
      onLine: (key: MessageKey) => {
        if (linesEnabled) showLine(t(key), 3200);
      },
    },
  );

  // G6 久别迎接：命中后本地短句气泡 + 表情闪现，同样不发模型请求
  const pokeReunion = useReunionGreeting({
    enabled: linesEnabled && emotionEnabled,
    onGreet: ({ lineKey, expression: greetExpression }) => {
      controllerRef.current?.flashExpression(greetExpression, REUNION_EXPRESSION_MS);
      showLine(t(lineKey), REUNION_LINE_MS);
    },
  });

  // 全域视线跟随（拖拽盒遮挡 canvas 宿主，故在舞台根层归一化喂指针）；
  // 指针重新进入窗口 → 久别判定一次（人回到桌宠前的「被重新关注」信号）
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
        pokeReunion();
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
  }, [pokeReunion]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent">
      <div className="absolute inset-0">
        <Live2dCanvas
          modelId={modelId}
          expression={expression}
          getLevel={getLevel}
          speaking={voiceState === 'speaking'}
          controllerRef={controllerRef}
        />
      </div>

      {/* 身体拖拽盒（底部 62%）：系统拖拽，吞点击 */}
      <div
        data-testid="pet-hitbody"
        style={
          {
            WebkitAppRegion: 'drag',
            left: '15%',
            right: '15%',
            top: '38%',
            bottom: '0',
          } as React.CSSProperties
        }
        className="absolute cursor-grab"
        onDragStart={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const w = window.innerWidth;
          const h = window.innerHeight;
          if (!isPetBodyPoint(e.clientX, e.clientY, w, h)) return;
          bridge?.dragBegin();
        }}
        onPointerUp={() => bridge?.dragEnd()}
      />

      {/* 头部互动盒（上部 27%）：单击摸头 / 双击回主窗 / 右键菜单 */}
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
        onClick={() => onHeadTouch()}
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
