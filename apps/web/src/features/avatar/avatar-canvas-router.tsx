'use client';

import dynamic from 'next/dynamic';
import { isVrmAvatarId } from '@wbfm/shared/schemas';
import type { Live2dCanvasProps } from './live2d-canvas';

const Live2dCanvas = dynamic(() => import('./live2d-canvas').then((m) => m.Live2dCanvas), {
  ssr: false,
});

const VrmCanvas = dynamic(() => import('./vrm-canvas').then((m) => m.VrmCanvas), {
  ssr: false,
});

export type AvatarCanvasRouterProps = Live2dCanvasProps;

/**
 * 形象渲染路由：avatarModelId 以 vrm: 为前缀走 VrmCanvas（three.js），否则 Live2dCanvas（PIXI）。
 * 外部（avatar-host / stage-actor / pet-stage）无感知。
 */
export function AvatarCanvasRouter(props: AvatarCanvasRouterProps) {
  if (isVrmAvatarId(props.modelId)) {
    return <VrmCanvas {...props} />;
  }
  return <Live2dCanvas {...props} />;
}
