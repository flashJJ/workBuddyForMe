/**
 * v3.0 T0.7：VRM canvas 的指针视线监听（纯 DOM 适配，便于单测与复用）。
 */

export interface GazeTarget {
  setGaze(nx: number, ny: number): void;
}

/** 把宿主内指针位置归一化后喂给控制器；返回解绑函数 */
export function attachGazePointer(
  host: HTMLElement,
  getTarget: () => GazeTarget | null,
): () => void {
  const onMove = (event: PointerEvent) => {
    const target = getTarget();
    if (!target) return;
    const rect = host.getBoundingClientRect();
    target.setGaze(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      ((event.clientY - rect.top) / rect.height) * 2 - 1,
    );
  };
  host.addEventListener('pointermove', onMove);
  return () => host.removeEventListener('pointermove', onMove);
}
