/**
 * v1.9 M3：会议 SSE 帧 → 舞台指令纯映射。
 * 与协作 run 适配器同构：舞台只消费 StageDirection，不感知会议状态机。
 * 渲染归属只采信帧里的 speakerId（协议 §4.3），正文自我宣称一律不解析。
 */
import type { StageCastMember, StageDirection, StageSlot } from '@wbfm/shared/schemas';
import type { MeetingEvent } from './meeting-types';
import { meetingSlotsFor } from './meeting-protocol';

/** avatar 回落（协议 §2.1：场景覆盖 → 全局设置（由调用方传入）→ haru） */
export const DEFAULT_MEETING_AVATAR = 'haru';

export interface MeetingCastMemberInput {
  id: string;
  name: string;
}

export interface MeetingAdapterState {
  slotById: Map<string, StageSlot>;
  currentSpeaker: string | null;
  seqBySpeaker: Map<string, number>;
  seq: number;
}

/** 席次按 memberIds 顺序绑定槽位；avatar 逐槽覆盖优先，否则回落 fallback 模型 */
export function createMeetingCast(
  members: MeetingCastMemberInput[],
  avatarOverrides?: Partial<Record<StageSlot, string>>,
  fallback = DEFAULT_MEETING_AVATAR,
): StageCastMember[] {
  const slots = meetingSlotsFor(members.length);
  return members.slice(0, slots.length).map((member, index) => {
    const slot = slots[index]!;
    return {
      slot,
      kind: 'assistant' as const,
      refId: member.id,
      displayName: member.name,
      avatarModelId: avatarOverrides?.[slot] ?? fallback,
      expression: 'neutral',
      actionLabelKey: 'stage.run.action.listening',
    };
  });
}

export function createMeetingAdapterState(members: MeetingCastMemberInput[]): MeetingAdapterState {
  const slots = meetingSlotsFor(members.length);
  const slotById = new Map<string, StageSlot>();
  members.slice(0, slots.length).forEach((member, index) => {
    slotById.set(member.id, slots[index]!);
  });
  return { slotById, currentSpeaker: null, seqBySpeaker: new Map(), seq: 0 };
}

const ALL_SLOTS: StageSlot[] = ['left', 'center', 'right', 'farRight'];

function allIdle(): StageDirection[] {
  return ALL_SLOTS.map((slot) => ({ t: 'motion', slot, group: 'idle' }));
}

/** 字幕上限沿用协议单条 200 字（与服务端落库截断同口径，避免超长 delta 糊脸） */
function clip(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 200 ? `${trimmed.slice(0, 199)}…` : trimmed;
}

function speechFor(state: MeetingAdapterState, speakerId: string, text: string): StageDirection[] {
  const slot = state.slotById.get(speakerId);
  if (!slot || !text.trim()) return [];
  if (state.currentSpeaker !== speakerId) {
    state.currentSpeaker = speakerId;
    state.seq += 1;
    state.seqBySpeaker.set(speakerId, state.seq);
  }
  const seq = state.seqBySpeaker.get(speakerId)!;
  return [{ t: 'speech', slot, text: clip(text), seq }];
}

export function adaptMeetingFrame(
  state: MeetingAdapterState,
  frame: MeetingEvent,
): StageDirection[] {
  switch (frame.event) {
    case 'meeting_turn': {
      const speakerId = frame.data.speakerIds[0];
      if (!speakerId) return [];
      const slot = state.slotById.get(speakerId);
      if (!slot) return [];
      state.currentSpeaker = null; // 下一帧 delta 视为新人新句
      const others = [...state.slotById.values()].filter((s) => s !== slot);
      return [
        { t: 'focus', slot },
        ...others.map((s) => ({ t: 'motion', slot: s, group: 'listening' }) as StageDirection),
        { t: 'motion', slot, group: 'thinking' },
      ];
    }
    case 'meeting_delta':
      return speechFor(state, frame.data.speakerId, frame.data.content);
    case 'meeting_message': {
      const { message } = frame.data;
      if (message.speakerKind !== 'assistant' || !message.speakerId) return [];
      const dirs = speechFor(state, message.speakerId, message.content);
      const slot = state.slotById.get(message.speakerId);
      if (slot) dirs.push({ t: 'motion', slot, group: 'idle' });
      return dirs;
    }
    case 'meeting_status': {
      if (frame.data.status === 'active') return [];
      return [{ t: 'focus', slot: null }, ...allIdle()];
    }
    default:
      return [];
  }
}
