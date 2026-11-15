'use client';

import type {
  StageCastMember,
  StageDirection,
  StageExpressionIntensity,
  StageMotionGroup,
  StageSlot,
} from '@wbfm/shared/schemas';
import type { ExpressionTag } from '@/features/avatar';

/**
 * v1.9 M2：把适配器产出的 StageDirection 落到舞台 runtime 状态。
 * 纯派发（React setState 集合），不含订阅/网络——订阅在 use-stage-run，
 * 映射在 @wbfm/core/stage-client。
 */
export interface StageRuntimeSetters {
  setCast: (members: StageCastMember[]) => void;
  setFocus: (slot: StageSlot | null) => void;
  setExpressions: (
    updater: (prev: Record<StageSlot, ExpressionTag>) => Record<StageSlot, ExpressionTag>,
  ) => void;
  setExpressionIntensities: (
    updater: (
      prev: Record<StageSlot, StageExpressionIntensity>,
    ) => Record<StageSlot, StageExpressionIntensity>,
  ) => void;
  setSpeech: (updater: (prev: Record<StageSlot, string | null>) => Record<StageSlot, string | null>) => void;
  setMotions: (updater: (prev: Record<StageSlot, StageMotionGroup>) => Record<StageSlot, StageMotionGroup>) => void;
  setLastLine: (line: { slot: StageSlot; text: string } | null) => void;
}

const INITIAL_EXPRESSION: Record<StageSlot, ExpressionTag> = {
  left: 'neutral',
  center: 'neutral',
  right: 'neutral',
  farRight: 'neutral',
};

const INITIAL_INTENSITY: Record<StageSlot, StageExpressionIntensity> = {
  left: 2,
  center: 2,
  right: 2,
  farRight: 2,
};

const LISTENING: Record<StageSlot, StageMotionGroup> = {
  left: 'listening',
  center: 'listening',
  right: 'listening',
  farRight: 'listening',
};

export function applyStageDirection(setters: StageRuntimeSetters, d: StageDirection): void {
  switch (d.t) {
    case 'cast':
      setters.setCast(d.members);
      setters.setExpressions(() => ({ ...INITIAL_EXPRESSION }));
      setters.setExpressionIntensities(() => ({ ...INITIAL_INTENSITY }));
      setters.setMotions(() => ({ ...LISTENING }));
      setters.setLastLine(null);
      break;
    case 'focus':
      setters.setFocus(d.slot);
      break;
    case 'speech':
      setters.setSpeech((prev) => ({ ...prev, [d.slot]: d.text }));
      setters.setLastLine({ slot: d.slot, text: d.text });
      break;
    case 'expression':
      setters.setExpressions((prev) => ({
        ...prev,
        [d.slot]: d.tag as ExpressionTag,
      }));
      setters.setExpressionIntensities((prev) => ({
        ...prev,
        [d.slot]: d.intensity ?? 2,
      }));
      break;
    case 'motion':
      setters.setMotions((prev) => ({ ...prev, [d.slot]: d.group }));
      break;
    case 'exit':
      // M2 协作拓扑不退场（三角色固定）；指令保留给 P1/会议模式
      break;
  }
}
