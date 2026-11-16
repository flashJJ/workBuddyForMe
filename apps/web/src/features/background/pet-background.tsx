'use client';

import { BackgroundLayer } from './background-layer';
import { useBackground } from './use-background';

/** v4.4 M4：桌宠窗独立背景；默认 none，保持窗口透明 */
export function PetBackground() {
  const view = useBackground('pet');
  return <BackgroundLayer view={view} testId="pet-background" className="absolute inset-0" />;
}
