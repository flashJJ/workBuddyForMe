'use client';

import { BackgroundLayer } from './background-layer';
import { useBackground } from './use-background';

/**
 * v4.4 M4：桌宠窗独立背景；默认 none，保持窗口透明。
 * v4.4 M6：有背景时内缩出画框宽度，并裁成圆角，与木相框对齐。
 */
export function PetBackground() {
  const view = useBackground('pet');
  const framed = view.resolved.kind !== 'none';
  return (
    <BackgroundLayer
      view={view}
      testId="pet-background"
      className={framed ? 'absolute inset-[7px] rounded-[15px]' : 'absolute inset-0'}
    />
  );
}
