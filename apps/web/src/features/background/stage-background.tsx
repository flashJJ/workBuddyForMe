'use client';

import type { ReactNode } from 'react';
import { BackgroundLayer } from './background-layer';
import { useBackground } from './hooks/use-background';

interface StageBackgroundProps {
  /** 未配置背景时保留的原有剧集背景层 */
  fallback: ReactNode;
}

/** v4.4 M4：舞台/小剧场背景；none 时交回 fallback */
export function StageBackground({ fallback }: StageBackgroundProps) {
  const view = useBackground('stage');
  if (view.resolved.kind === 'none') return <>{fallback}</>;
  return <BackgroundLayer view={view} testId="stage-custom-background" className="absolute inset-0 z-[1]" />;
}
