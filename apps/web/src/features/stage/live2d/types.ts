import type { StageSlot } from '@wbfm/shared/schemas';
import type { ExpressionTag } from '@/features/avatar';
import type { ActorLayout } from '../stage-layout';

/** 共享 Live2D 层里单个角色的渲染输入（按槽位稳定更新，不重建 React 树） */
export interface StageLive2dActor {
  slot: StageSlot;
  modelId: string;
  layout: ActorLayout;
  expression: ExpressionTag;
  speaking: boolean;
  getLevel: () => number;
}

export interface StageLive2dOptions {
  /** live=全部更新；portrait=仅聚焦槽更新，其余保留最后一帧 */
  powerMode: 'live' | 'portrait';
  focus: StageSlot | null;
}
