'use client';

import * as React from 'react';
import { AvatarCanvasRouter } from '@/features/avatar';
import type { Live2dController } from '@/features/avatar';
import type { ExpressionTag } from '@/features/avatar';
import { useI18n } from '@/lib/i18n/use-i18n';
import { isVrmAvatarId } from '@wbfm/shared/schemas';
import type { StageCastMember, StageSlot, StageSlotPlacement } from '@wbfm/shared/schemas';
import { clampActorScale, clampRatio, type ActorLayout } from './stage-layout';

interface StageActorProps {
  slot: StageSlot;
  member: StageCastMember;
  layout: ActorLayout;
  /** 是否处于活跃更新（省电档下仅聚焦槽为 true）；Live2D 画布由共享层负责 */
  live: boolean;
  expression: ExpressionTag;
  actionLabelKey?: string;
  speaking: boolean;
  showNameplate: boolean;
  getLevel: () => number;
  onPlacementChange: (slot: StageSlot, placement: StageSlotPlacement) => void;
  onActorScale: (slot: StageSlot, scale: number) => void;
  /** Live2D 降为立绘前的截帧缓存（key=avatarModelId） */
  snapshot: string | null;
  onSnapshot: (modelId: string, dataUrl: string) => void;
}

/**
 * 单槽角色的 DOM 命中盒与名字牌：
 * - Live2D 由舞台共享层统一渲染（单 WebGL 上下文），本组件只保留拖拽/缩放与压暗遮罩；
 * - VRM 仍在本组件挂载画布，省电档下截帧为立绘；
 * - 名字牌：名字（强）/表情+动作（弱色）一行分层。
 */
export function StageActor(props: StageActorProps) {
  const { t } = useI18n();
  const isVrm = isVrmAvatarId(props.member.avatarModelId);
  const controllerRef = React.useRef<Live2dController | null>(null);
  // 内部渲染态：即使目标档位是省电，也先挂一次 Live2D 拿到有效立绘再卸载；
  // 否则首帧直接进省电档时没有 controller，截帧永远是空，角色会变成空白。
  const [renderLive, setRenderLive] = React.useState(true);
  const dragRef = React.useRef<{ pointerId: number; startX: number; startY: number; base: StageSlotPlacement } | null>(null);

  React.useEffect(() => {
    // Live2D 已交给舞台共享渲染层，这里只处理 VRM 的立绘降级
    if (!isVrm) return;
    if (props.live) {
      setRenderLive(true);
      return;
    }
    let cancelled = false;
    const capture = (): boolean => {
      const shot = controllerRef.current?.captureDataUrl();
      if (!shot) return false;
      props.onSnapshot(props.member.avatarModelId, shot);
      if (!cancelled) setRenderLive(false);
      return true;
    };
    // 模型是异步加载的：首轮截不到就每 500ms 重试，最多 6s；
    // 仍失败则保持 Live2D（宁可多一个实例，也不要空白角色）。
    if (capture()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (cancelled || capture() || attempts >= 12) clearInterval(timer);
    }, 500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.live, props.member.avatarModelId, isVrm]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // 拖拽基准取当前生效比例坐标（leftPct/topPct 即锚点比例×100，未含缩放/聚焦系数）
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      base: {
        x: props.layout.leftPct / 100,
        y: props.layout.topPct / 100,
        scale: currentSlotScale(props),
      },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const parent = event.currentTarget.parentElement;
    if (!parent) return;
    const pr = parent.getBoundingClientRect();
    const nx = drag.base.x + (event.clientX - drag.startX) / pr.width;
    const ny = drag.base.y + (event.clientY - drag.startY) / pr.height;
    props.onPlacementChange(props.slot, { ...drag.base, x: clampRatio(nx), y: clampRatio(ny) });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) return; // 画面缩放在舞台根处理
    const next = clampActorScale(currentSlotScale(props) + (event.deltaY > 0 ? -0.06 : 0.06));
    props.onActorScale(props.slot, next);
  };

  const style: React.CSSProperties = {
    left: `${props.layout.leftPct}%`,
    top: `${props.layout.topPct}%`,
    height: `${props.layout.heightVh}vh`,
    width: `${props.layout.widthVh}vh`,
    transform: 'translate(-50%, -50%)',
    // Live2D 在共享层里，用半透明遮罩压暗；VRM 仍在盒内，用 CSS 滤镜
    filter: isVrm ? props.layout.filter : 'none',
    zIndex: props.layout.zIndex,
    transition: 'left 420ms ease, top 420ms ease, height 420ms ease, width 420ms ease, filter 420ms ease',
    cursor: 'grab',
    touchAction: 'none',
  };

  return (
    <div
      className="absolute select-none"
      style={style}
      data-testid={`stage-actor-${props.slot}`}
      data-focused={props.layout.focused}
      data-live={isVrm ? renderLive : props.live}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
    >
      {isVrm ? (
        renderLive ? (
          <AvatarCanvasRouter
            modelId={props.member.avatarModelId}
            expression={props.expression}
            getLevel={props.getLevel}
            speaking={props.speaking}
            controllerRef={controllerRef}
          />
        ) : (
          <div className="relative h-full w-full" data-testid={`stage-portrait-${props.slot}`}>
            {props.snapshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.snapshot} alt="" className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full w-full items-end justify-center pb-[18%] text-5xl opacity-60">
                {props.member.displayName.slice(0, 1)}
              </div>
            )}
          </div>
        )
      ) : !props.live ? (
        // Live2D 模型在共享层里保持可见；省电档只是停止更新，不再截一张可能空白的立绘
        <div className="relative h-full w-full" data-testid={`stage-portrait-${props.slot}`} />
      ) : null}

      {!isVrm && props.layout.filter !== 'none' && (
        <div
          className="pointer-events-none absolute inset-0 bg-black/25"
          data-testid={`stage-dim-${props.slot}`}
        />
      )}

      {props.showNameplate && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-[6vh] flex flex-col items-center gap-0.5 pb-1 text-center"
          data-testid={`stage-nameplate-${props.slot}`}
        >
          <span className="rounded bg-black/45 px-2 text-sm font-semibold tracking-wide text-white">
            {props.member.displayName}
          </span>
          <span className="rounded bg-black/30 px-1.5 text-[11px] text-white/80">
            {t(`stage.expression.${props.expression}` as never)}
            {props.actionLabelKey ? ` · ${t(props.actionLabelKey as never)}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}

/** 从布局反推槽位自身 scale（去掉聚焦系数），滚轮步进基于它 */
function currentSlotScale(props: StageActorProps): number {
  // 父级传入的 onPlacementChange 带当前 scale；这里用近似反推：聚焦系数固定可除
  const boost = props.layout.focused ? 1.12 : 1;
  const zoom = 1; // zoom 不参与单角色 scale 存储；滚轮只写槽位 scale
  const derived = props.layout.heightVh / (82 * zoom * boost);
  return Number.isFinite(derived) && derived > 0 ? derived : 1;
}
