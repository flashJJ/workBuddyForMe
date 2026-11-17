'use client';

import { useSettings } from '@/lib/hooks/provider';

/**
 * v4.4：整屏模式的单层工作区材质。
 *
 * 只有这一层做半透明 + 模糊，内容卡片保持主题实色；
 * 避免每个卡片各透一层，导致同页亮度/主题不一致。
 */
export function MainWorkspaceGlass() {
  const { data } = useSettings();
  if (data?.background?.main?.mode !== 'window') return null;
  return (
    <div
      aria-hidden
      data-testid="main-workspace-glass"
      className="app-workspace-glass absolute inset-y-0 right-0 left-14 -z-[5] md:left-56"
    />
  );
}
