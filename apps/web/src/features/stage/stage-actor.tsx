'use client';

import * as React from 'react';
import { AvatarCanvasRouter } from '@/features/avatar';
import type { Live2dController } from '@/features/avatar';
import type { ExpressionTag } from '@/features/avatar';
import { useI18n } from '@/lib/i18n/use-i18n';
import { isVrmAvatarId } from '@wbfm/shared/schemas';
import type { StageCastMember, StageExpressionIntensity, StageSlot, StageSlotPlacement } from '@wbfm/shared/schemas';
import { clampActorScale, clampRatio, type ActorLayout } from './stage-layout';
import type { StageMotionCue } from './theater/stage-motion-cue';

interface StageActorProps {
  slot: StageSlot;
  member: StageCastMember;
  layout: ActorLayout;
  /** 是否处于活跃更新（省电档下仅聚焦槽为 true）；Live2D 画布由共享层负责 */
  live: boolean;
  expression: ExpressionTag;
  /** 表情强度（1 轻 / 2 中 / 3 强）；Live2D 忽略 */
  expressionIntensity?: StageExpressionIntensity;
  /** 舞台相对位置朝向（弧度；仅 VRM 执行整体微转） */
  stageFacing?: number;
  actionLabelKey?: string;
  speaking: boolean;
  showNameplate: boolean;
  getLevel: () => number;
  onPlacementChange: (slot: StageSlot, placement: StageSlotPlacement) => void;
  onActorScale: (slot: StageSlot, scale: number) => void;
  /** 轻点（未发生拖拽）时回调：mock 演示里用于让该角色说一句 */
  onTap?: (slot: StageSlot) => void;
  /** 剧场动作 cue（仅 VRM 执行；Live2D 保持共享层行为） */
  motionCue?: StageMotionCue | null;
  /** cue 触发序号（台词 index）；变化时才重放 */
  motionCueKey?: number;
  /** 模型就绪/失败：剧场加载幕布据此放行 */
  onActorReady?: (slot: StageSlot) => void;
  onActorError?: (slot: StageSlot) => void;
}

/**
 * 单槽角色的 DOM 命中盒与名字牌：
 * - Live2D 由舞台共享层统一渲染（单 WebGL 上下文），本组件只保留拖拽/缩放与压暗遮罩；
 * - VRM 始终保留画布：省电档只暂停渲染，不卸载模型，避免换发言者时重复加载；
 * - 名字牌：名字（强）/表情+动作（弱色）一行分层。
 */
export function StageActor(props: StageActorProps) {
  const { t } = useI18n();
  const isVrm = isVrmAvatarId(props.member.avatarModelId);
  const controllerRef = React.useRef<Live2dController | null>(null);
  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
    base: StageSlotPlacement;
  } | null>(null);

  // 剧场 cue：只走剧本动作槽，不碰待机余兴；模型异步就绪后补播
  React.useEffect(() => {
    const cue = props.motionCue;
    if (!isVrm || !cue || props.motionCueKey === undefined) return;
    let cancelled = false;
    let attempts = 0;
    const play = (): boolean => {
      const controller = controllerRef.current as unknown as {
        playScriptMotion?(id: string, options?: { fadeMs?: number }): boolean;
        playBehaviorNow?(id: string): boolean;
      } | null;
      if (!controller) return false;
      if (cue.kind === 'behavior') return controller.playBehaviorNow?.(cue.id) ?? false;
      return controller.playScriptMotion?.(cue.id, { fadeMs: cue.fadeMs }) ?? false;
    };
    if (play()) return;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (cancelled || play() || attempts >= 20) window.clearInterval(timer);
    }, 400);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // cue 对象每次渲染重建，触发只看序号；动作 id 在 effect 首帧固化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.motionCueKey, isVrm]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // 拖拽基准取当前生效比例坐标（leftPct/topPct 即锚点比例×100，未含缩放/聚焦系数）
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
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
    if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) {
      drag.moved = true;
    }
    props.onPlacementChange(props.slot, { ...drag.base, x: clampRatio(nx), y: clampRatio(ny) });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    // 轻点（没有产生位移）视为交互，交给上层决定说什么
    if (!drag.moved) props.onTap?.(props.slot);
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
      data-live={props.live}
      data-motion-cue={props.motionCue ? `${props.motionCue.kind}:${props.motionCue.id}` : undefined}
      data-expression-intensity={props.expressionIntensity}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
    >
      {isVrm ? (
        <AvatarCanvasRouter
          modelId={props.member.avatarModelId}
          expression={props.expression}
          expressionIntensity={props.expressionIntensity}
          stageFacing={props.stageFacing}
          getLevel={props.getLevel}
          speaking={props.speaking}
          controllerRef={controllerRef}
          motionProfile="stage"
          onReady={() => props.onActorReady?.(props.slot)}
          onError={() => props.onActorError?.(props.slot)}
          // 非焦点角色降速而不是停渲染：画布常驻可避免重载，停渲染会让 WebGL 画布变透明
          frameMode={props.live ? 'idle' : 'slow'}
        />
      ) : !props.live ? (
        // Live2D 模型在共享层里保持可见；省电档只是停止更新，不再截一张可能空白的立绘
        <div className="relative h-full w-full" data-testid={`stage-portrait-${props.slot}`} />
      ) : null}

      {!isVrm && props.layout.filter !== 'none' && (
        <div
          className="pointer-events-none absolute inset-0"
          data-testid={`stage-dim-${props.slot}`}
          // 非焦点角色的压暗：用椭圆渐变收边，避免矩形硬边被误认成「选中框」
          style={{
            background:
              'radial-gradient(ellipse 52% 42% at 50% 40%, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.28) 55%, rgba(0,0,0,0) 78%)',
          }}
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
