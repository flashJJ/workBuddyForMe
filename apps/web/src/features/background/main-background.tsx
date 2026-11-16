'use client';

import { BackgroundLayer } from './background-layer';
import { useBackground } from './hooks/use-background';

/** v4.4 M4：主窗口背景；聊天模式只铺内容区，整屏模式铺满窗口 */
export function MainBackground() {
  const view = useBackground('main');
  const className =
    view.mode === 'window'
      ? 'absolute inset-0 -z-10'
      : 'absolute inset-y-0 right-0 left-14 -z-10 md:left-56';
  return <BackgroundLayer view={view} testId="main-background" className={className} />;
}
