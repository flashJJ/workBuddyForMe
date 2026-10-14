import type { StageCastMember, StageSlot } from '@wbfm/shared/schemas';

/**
 * M1 mock cast（docs/plan/v1.9/README M1 出口：mock cast 可演）。
 * M2 协作 run 适配器产出的真实 cast 替换这里，舞台组件不感知来源。
 */
export const MOCK_CAST: StageCastMember[] = [
  {
    slot: 'left',
    kind: 'agent-role',
    refId: 'planner',
    displayName: '规划',
    avatarModelId: 'hiyori',
    expression: 'neutral',
    actionLabelKey: 'stage.mock.action.listening',
  },
  {
    slot: 'center',
    kind: 'agent-role',
    refId: 'executor',
    displayName: '执行',
    avatarModelId: 'haru',
    expression: 'neutral',
    actionLabelKey: 'stage.mock.action.working',
  },
  {
    slot: 'right',
    kind: 'agent-role',
    refId: 'reviewer',
    displayName: '审查',
    avatarModelId: 'mao',
    expression: 'neutral',
    actionLabelKey: 'stage.mock.action.listening',
  },
];

export const MOCK_SPEECH: Record<StageSlot, string> = {
  left: '我先把目标拆成三步，我们按顺序推进。',
  center: '收到，第一步开始执行，状态会实时同步。',
  right: '结果我看过了，验收点全部满足，通过。',
  // farRight 仅 v1.9 M3 四人会议使用，mock 演示无此席
  farRight: '',
};

export const MOCK_EXPRESSIONS = ['neutral', 'joy', 'sadness', 'anger'] as const;

export function findMockMember(slot: StageSlot): StageCastMember {
  return MOCK_CAST.find((m) => m.slot === slot) ?? MOCK_CAST[1]!;
}
