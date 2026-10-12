'use client';

import * as React from 'react';
import { Live2dCanvas } from '@/features/avatar/live2d-canvas';
import type { Live2dController } from '@/features/avatar/live2d-controller';
import { useHeadTouch, type TouchControllerLike } from '@/features/avatar/use-head-touch';
import type { PetVoiceState } from '@wbfm/shared/pet';
import type { MessageKey } from '@wbfm/shared/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
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
 */
export function PetStage({ modelId, expression, voiceState, subtitle, getLevel }: Props) {
  const { t } = useI18n();
  const bridge = getPetBridge();
  const controllerRef = React.useRef<Live2dController | null>(null);
  const [touchLine, setTouchLine] = React.useState<string>('');
  const lineTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // 摸头短句：本地文案气泡约 3.2s 后消失（零模型调用、零 IPC）
  const onHeadTouch = useHeadTouch(
    controllerRef as React.MutableRefObject<TouchControllerLike | null>,
    {
      onLine: (key: MessageKey) => {
        setTouchLine(t(key));
        if (lineTimerRef.current) clearTimeout(lineTimerRef.current);
        lineTimerRef.current = setTimeout(() => setTouchLine(''), 3200);
      },
    },
  );

  React.useEffect(
    () => () => {
      if (lineTimerRef.current) clearTimeout(lineTimerRef.current);
    },
    [],
  );

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

      {/* 字幕气泡 */}
      <PetSubtitle text={touchLine || subtitle} voiceState={voiceState} />
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
