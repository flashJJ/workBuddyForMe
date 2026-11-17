'use client';

import { isChatMode } from '@wbfm/shared/schemas';
import { useSettings } from '@/lib/hooks/provider';

/**
 * v4.4：整屏模式的单层工作区材质。
 *
 * 只有这一层做半透明（不做模糊），内容卡片按层级 token 叠加；
 * 模糊只由背景层的 blur 参数控制，避免未选模糊却整体发虚。
 */
export function MainWorkspaceGlass() {
  const { data } = useSettings();
  if (isChatMode(data?.background?.main?.mode)) return null;
  return (
    <div
      aria-hidden
      data-testid="main-workspace-glass"
      className="app-workspace-glass absolute inset-y-0 right-0 left-14 -z-[5] md:left-56"
    />
  );
}
