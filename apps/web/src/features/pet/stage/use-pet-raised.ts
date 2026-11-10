'use client';

import * as React from 'react';
import type { InteractionEvent } from '@wbfm/shared/schemas';
import type { Live2dController } from '@/features/avatar';

/** 向上拖拽超过该距离视为「提起」（窗口本身已在拖拽移动） */
export const RAISED_THRESHOLD_PX = 24;

export interface RaisedGesture {
  /** pointerdown 时重置 */
  reset(): void;
  /** pointermove：dy 为相对按下点的垂直位移（向上为负） */
  move(dy: number): void;
  /** pointerup/cancel：放下并回弹 */
  release(): void;
}

/** 提起手势：向上拖过阈值 → 进入悬空姿态并派发 raised 事件；松手 → 落地 squash */
export function useRaisedGesture(
  controllerRef: React.MutableRefObject<Live2dController | null>,
  resolveAndDispatch: (event: InteractionEvent) => void,
): RaisedGesture {
  const liftedRef = React.useRef(false);

  return React.useMemo(
    () => ({
      reset: () => {
        liftedRef.current = false;
      },
      move: (dy: number) => {
        if (liftedRef.current || dy > -RAISED_THRESHOLD_PX) return;
        liftedRef.current = true;
        (controllerRef.current as any)?.setRaised?.(true);
        resolveAndDispatch({ kind: 'touch', region: 'raised', gesture: 'tap' });
      },
      release: () => {
        if (!liftedRef.current) return;
        liftedRef.current = false;
        const controller = controllerRef.current as any;
        controller?.setRaised?.(false);
        controller?.playSquash?.();
      },
    }),
    [controllerRef, resolveAndDispatch],
  );
}
