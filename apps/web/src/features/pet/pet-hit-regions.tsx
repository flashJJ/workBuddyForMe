'use client';

import * as React from 'react';
import type { WbfmPetBridge } from '@wbfm/shared/pet';
import type { InteractionEvent } from '@wbfm/shared/schemas';
import type { Live2dController } from '@/features/avatar/live2d-controller';
import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * 桌宠交互命中盒（由 PetStage 外迁）。
 *
 * 两个盒子都是 no-drag + 手动拖拽：pointerdown 起计时长按、移动超阈值转拖拽、
 * 松手未拖拽即视为纯点击。命中盒常量与主进程 PetDragController 的判定保持同一份口径。
 */

/** 与 pet-drag-controller 的 DIP 阈值等价的 CSS 像素阈值（轴对齐 AND 判定） */
const DRAG_THRESHOLD_PX = 6;
/** 长按判定阈值（ms） */
const LONGPRESS_THRESHOLD_MS = 500;

export interface PetHitRegionProps {
  bridge: WbfmPetBridge | null;
  controllerRef: React.MutableRefObject<Live2dController | null>;
  /** 交给 Resolver 门控 + ActionExecutor 执行，并 emit 到 TriggerBus */
  resolveAndDispatch: (event: InteractionEvent) => void;
}

/** 身体互动盒（底部 62%）：no-drag + 手动拖拽 + 纯点击动作 */
export function PetHitBody({ bridge, controllerRef, resolveAndDispatch }: PetHitRegionProps) {
  const pressStartRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pressMovedRef = React.useRef<boolean>(false);
  const bridgeActiveRef = React.useRef<boolean>(false);
  const pointerDownRef = React.useRef<boolean>(false);
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = React.useRef<boolean>(false);

  React.useEffect(
    () => () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    },
    [],
  );

  return (
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
        pointerDownRef.current = true;
        pressStartRef.current = { x: e.clientX, y: e.clientY };
        pressMovedRef.current = false;
        bridgeActiveRef.current = false;
        longPressFiredRef.current = false;
        // body-touch 程序化 start（让角色提前进入 phase='start'，等待后续判定）
        (controllerRef.current as any)?.startInteraction?.('body-touch');
        longPressTimerRef.current = setTimeout(() => {
          if (!pressMovedRef.current) {
            longPressFiredRef.current = true;
            resolveAndDispatch({ kind: 'touch', region: 'body', gesture: 'longpress' });
          }
        }, LONGPRESS_THRESHOLD_MS);
      }}
      onPointerMove={(e) => {
        // 自愈：OS 层面左键已松开（buttons=0）时，任何指针移动都不能算拖拽。
        // 命中盒的 pointerup 在指针移出盒子/丢指针捕获时可能收不到，会留下「幽灵按下」状态，
        // 之后仅悬停就会持续 dragBegin/dragTo，把窗口按陈旧偏移一路带着走
        //（表现：鼠标一靠近桌宠就被挪走、怎么追都追不上）。
        if (e.buttons === 0) {
          if (bridgeActiveRef.current) {
            bridge?.dragEnd();
            bridgeActiveRef.current = false;
          }
          pointerDownRef.current = false;
          pressMovedRef.current = false;
          return;
        }
        // 穿透态 forward=true 时 pointermove 也会到达渲染层，但没有 pointerdown——
        // 必须确认按下确实发生过才进入拖拽判定，避免假 dragBegin 把窗口追着光标拖
        if (!pointerDownRef.current) return;
        const start = pressStartRef.current;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        // 轴对齐 AND 判定（和主进程 PetDragController 保持一致），避免对角线方向误触发
        if (Math.abs(dx) >= DRAG_THRESHOLD_PX || Math.abs(dy) >= DRAG_THRESHOLD_PX) {
          pressMovedRef.current = true;
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          if (!bridgeActiveRef.current) {
            bridgeActiveRef.current = true;
            bridge?.dragBegin();
            // 进入拖拽模式 → 取消 body-touch 交互状态
            (controllerRef.current as any)?.endInteraction?.();
          }
        }
        // 拖拽已激活 → 持续调 dragTo 更新位置（无 dragTo 就不会移动）
        if (bridgeActiveRef.current) {
          bridge?.dragTo();
        }
      }}
      onClick={(e) => {
        // 双击的第二下不再重复派发单击链（双击由 onDoubleClick 接管，避免叠两次反馈）
        if (e.detail > 1) return;
        // 长按已触发 → 跳过 tap（防表情覆盖）
        if (longPressFiredRef.current) {
          longPressFiredRef.current = false;
          return;
        }
        // 纯点击（pointerdown → pointerup 间 move ≤ 3px）→ body-touch
        if (!bridgeActiveRef.current) {
          resolveAndDispatch({ kind: 'touch', region: 'body', gesture: 'tap' });
        }
      }}
      onDoubleClick={() => {
        // v2.2：双击身体 = 角色动作；头部盒的双击仍是「回主窗」的窗口行为，两者分开
        if (!bridgeActiveRef.current) {
          resolveAndDispatch({ kind: 'touch', region: 'body', gesture: 'double' });
        }
      }}
      onPointerUp={() => {
        pointerDownRef.current = false;
        if (bridgeActiveRef.current) {
          bridge?.dragEnd();
          bridgeActiveRef.current = false;
        } else {
          (controllerRef.current as any)?.endInteraction?.();
        }
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }}
      onPointerCancel={() => {
        pointerDownRef.current = false;
        if (bridgeActiveRef.current) {
          bridge?.dragEnd();
          bridgeActiveRef.current = false;
        }
        (controllerRef.current as any)?.endInteraction?.();
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }}
    />
  );
}

/** 头部互动盒（上部 27%）：单击摸头 / 长按持续 loop / 拖拽移动 / 双击回主窗 / 右键菜单 */
export function PetHitHead({ bridge, controllerRef, resolveAndDispatch }: PetHitRegionProps) {
  const { t } = useI18n();
  const pressStartPosRef = React.useRef<{ x: number; y: number; at: number }>({
    x: 0,
    y: 0,
    at: 0,
  });
  const pressMovedRef = React.useRef<boolean>(false);
  const bridgeActiveRef = React.useRef<boolean>(false);
  const pointerDownRef = React.useRef<boolean>(false);
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = React.useRef<boolean>(false); // 长按已触发过 → 挡 onClick tap

  React.useEffect(
    () => () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    },
    [],
  );

  return (
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
        pointerDownRef.current = true;
        pressStartPosRef.current = { x: e.clientX, y: e.clientY, at: performance.now() };
        pressMovedRef.current = false;
        bridgeActiveRef.current = false;
        longPressFiredRef.current = false; // 重置长按标记
        (controllerRef.current as any)?.startInteraction?.('head-touch');
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = setTimeout(() => {
          if (!pressMovedRef.current && !bridgeActiveRef.current) {
            longPressFiredRef.current = true;
            resolveAndDispatch({ kind: 'touch', region: 'head', gesture: 'longpress' });
          }
        }, LONGPRESS_THRESHOLD_MS);
      }}
      onPointerMove={(e) => {
        // 自愈：OS 层面左键已松开（buttons=0）时，任何指针移动都不能算拖拽。
        // 命中盒的 pointerup 在指针移出盒子/丢指针捕获时可能收不到，会留下「幽灵按下」状态，
        // 之后仅悬停就会持续 dragBegin/dragTo，把窗口按陈旧偏移一路带着走
        //（表现：鼠标一靠近桌宠就被挪走、怎么追都追不上）。
        if (e.buttons === 0) {
          if (bridgeActiveRef.current) {
            bridge?.dragEnd();
            bridgeActiveRef.current = false;
          }
          pointerDownRef.current = false;
          pressMovedRef.current = false;
          return;
        }
        // 穿透态 forward=true 时 pointermove 也会到达渲染层，但没有 pointerdown——
        // 必须确认按下确实发生过才进入拖拽判定，避免假 dragBegin 把窗口追着光标拖
        if (!pointerDownRef.current) return;
        const start = pressStartPosRef.current;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        // 轴对齐 AND 判定（和主进程 PetDragController 保持一致），避免对角线方向误触发
        if (Math.abs(dx) >= DRAG_THRESHOLD_PX || Math.abs(dy) >= DRAG_THRESHOLD_PX) {
          pressMovedRef.current = true;
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          // head 区域也支持拖拽移动窗口
          if (!bridgeActiveRef.current) {
            bridgeActiveRef.current = true;
            bridge?.dragBegin();
            (controllerRef.current as any)?.endInteraction?.();
          }
        }
        // 拖拽已激活 → 持续调 dragTo 更新位置
        if (bridgeActiveRef.current) {
          bridge?.dragTo();
        }
      }}
      onClick={() => {
        // 长按已触发 → 跳过 tap（否则 flashExpression(joy) 会覆盖 longpress 的 surprise）
        if (longPressFiredRef.current) {
          longPressFiredRef.current = false;
          return;
        }
        resolveAndDispatch({ kind: 'touch', region: 'head', gesture: 'tap' });
      }}
      onPointerUp={() => {
        pointerDownRef.current = false;
        (controllerRef.current as any)?.endInteraction?.();
        if (bridgeActiveRef.current) {
          bridge?.dragEnd();
          bridgeActiveRef.current = false;
        }
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }}
      onPointerCancel={() => {
        pointerDownRef.current = false;
        (controllerRef.current as any)?.endInteraction?.();
        if (bridgeActiveRef.current) {
          bridge?.dragEnd();
          bridgeActiveRef.current = false;
        }
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }}
      onDoubleClick={() => bridge?.focusMain()}
      onContextMenu={(event) => {
        event.preventDefault();
        bridge?.showMenu();
      }}
    />
  );
}
