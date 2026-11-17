'use client';

import * as React from 'react';
import { MotionContentMenu, type MotionContentSelection } from '@/features/avatar';

interface Props {
  /** 桌宠 controllerRef；VRM 支持 playBehaviorNow / playScriptMotion / playPose */
  controllerRef: React.MutableRefObject<unknown>;
  /** 菜单矩形上报：桌宠窗穿透态下把这块区域并入命中轮廓 */
  onRectChange?: (rect: { x: number; y: number; width: number; height: number } | null) => void;
}

/** v4.0：桌宠的内容包动效选择入口 */
export function PetMotionMenu({ controllerRef, onRectChange }: Props) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const rectCbRef = React.useRef(onRectChange);
  rectCbRef.current = onRectChange;

  const reportRect = React.useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    rectCbRef.current?.(
      rect && rect.width > 0 && rect.height > 0
        ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        : null,
    );
  }, []);

  React.useLayoutEffect(() => reportRect(), [reportRect]);

  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => reportRect());
    observer?.observe(el);
    window.addEventListener('resize', reportRect);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', reportRect);
      rectCbRef.current?.(null);
    };
  }, [reportRect]);

  const apply = React.useCallback(
    (selection: MotionContentSelection) => {
      const controller = controllerRef.current as {
        playBehaviorNow?(id: string): boolean;
        playScriptMotion?(id: string, options?: { fadeMs?: number }): boolean;
        playPose?(id: string, holdMs?: number): boolean;
      } | null;
      if (selection.kind === 'behavior') controller?.playBehaviorNow?.(selection.id);
      else if (selection.kind === 'motion') {
        controller?.playScriptMotion?.(selection.id, { fadeMs: 200 });
      } else controller?.playPose?.(selection.id, 2400);
    },
    [controllerRef],
  );

  return (
    <div ref={rootRef} className="pointer-events-auto fixed bottom-2 left-2 z-50 w-56">
      <MotionContentMenu onApply={apply} />
    </div>
  );
}
