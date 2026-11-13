'use client';

import dynamic from 'next/dynamic';
import { isVrmAvatarId, type MotionMood } from '@wbfm/shared/schemas';
import type { Live2dCanvasProps } from '../live2d/live2d-canvas';

const Live2dCanvas = dynamic(() => import('../live2d/live2d-canvas').then((m) => m.Live2dCanvas), {
  ssr: false,
});

const VrmCanvas = dynamic(() => import('../vrm/vrm-canvas').then((m) => m.VrmCanvas), {
  ssr: false,
});

/**
 * v2.2：状态驱动挑选的输入（仅 VRM 用；Live2D 忽略——其动作由 Cubism motion group 决定）。
 * 作为可选字段挂在路由 props 上，Live2D 侧行为零变化。
 */
export type AvatarCanvasRouterProps = Live2dCanvasProps & {
  mood?: MotionMood;
  relationshipLevel?: number;
  /** v3.5：久无交互背对 / 被交互转回（仅 VRM；Live2D 忽略） */
  faceAway?: boolean;
  /** v3.0 T0.7：VRM 帧循环回调（仅 VRM；Live2D 忽略） */
  onFrame?: (dtMs: number) => void;
  /** v3.5：桌宠大小（仅 VRM 取景生效；Live2D 忽略） */
  petSize?: 'sm' | 'md' | 'lg';
  /** v3.0 P4：Q 版比例（仅 VRM 生效；Live2D 忽略） */
  chibi?: boolean;
};

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
