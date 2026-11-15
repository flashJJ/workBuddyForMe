import type { StageCastMember } from '@wbfm/shared/schemas';

/** 三席全部使用内置 VRM 角色（雪团 / 冉卡露丽 / 菲比） */
export const THEATER_CAST: StageCastMember[] = [
  {
    slot: 'left',
    kind: 'assistant',
    refId: 'rankaluli',
    displayName: '冉卡露丽',
    avatarModelId: 'vrm:builtin:rankaluli',
    expression: 'neutral',
    voicePreference: { ttsModel: 'kokoro', speakerSid: 32 },
  },
  {
    slot: 'center',
    kind: 'assistant',
    refId: 'xuetuan',
    displayName: '雪团',
    avatarModelId: 'vrm:builtin:xuetuan',
    expression: 'neutral',
    voicePreference: { ttsModel: 'kokoro', speakerSid: 18 },
  },
  {
    slot: 'right',
    kind: 'assistant',
    refId: 'feibi',
    displayName: '菲比',
    avatarModelId: 'vrm:builtin:feibi',
    expression: 'neutral',
    voicePreference: { ttsModel: 'kokoro', speakerSid: 3 },
  },
];
