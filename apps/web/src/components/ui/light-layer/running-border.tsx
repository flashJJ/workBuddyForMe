'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const COLOR_TOKENS = new Set([
  'primary',
  'info',
  'success',
  'warning',
  'active',
  'destructive',
  'muted-foreground',
]);

export interface RunningBorderProps {
  active: boolean;
  colorToken?: string;
  /** 业务文案已由节点卡片提供；边框本身对读屏隐藏 */
  label?: string;
  className?: string;
}

/** v2.20 M3：活跃节点流动边框；只读 active/colorToken，不承载业务状态。 */
export function RunningBorder({ active, colorToken = 'primary', className }: RunningBorderProps) {
  if (!active) return null;
  const token = COLOR_TOKENS.has(colorToken) ? colorToken : 'primary';
  return (
    <div
      aria-hidden="true"
      data-testid="running-border"
      className={cn('running-border', className)}
      style={{ '--running-border-color': `hsl(var(--${token}))` } as React.CSSProperties}
    />
  );
}
