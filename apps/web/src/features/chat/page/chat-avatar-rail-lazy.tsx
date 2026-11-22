'use client';

import dynamic from 'next/dynamic';

/**
 * v4.20：形象栏包含 Live2D/VRM 运行时，延迟到首屏可交互后再加载，避免拖慢冷启动。
 * 加载占位与真实栏同宽，避免右栏出现布局跳动。
 */
export const LazyChatAvatarRail = dynamic(
  () => import('@/features/avatar/ui').then((mod) => mod.ChatAvatarRail),
  {
    ssr: false,
    loading: () => (
      <div
        className="hidden w-64 shrink-0 border-l bg-ui-card lg:block xl:w-72"
        aria-hidden="true"
      />
    ),
  },
);
