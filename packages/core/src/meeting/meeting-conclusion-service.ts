import type {
  MeetingActionItemCreateInput,
  MeetingActionItemUpdateInput,
  MeetingConclusionUpdateInput,
} from '@wbfm/shared/schemas';
import { ApiError } from '@wbfm/shared/errors';
import type {
  MeetingActionItemRecord,
  MeetingConclusionView,
  MeetingMessageRecord,
  MeetingRecord,
} from '@wbfm/shared/types';
import type { MeetingRepositoryForConclusion } from '@wbfm/database';
import type { MeetingServiceDeps } from './meeting-types';
import {
  CONCLUSION_TRANSCRIPT_MAX_CHARS,
  buildChunkSystemPrompt,
  buildChunkUserPrompt,
  buildConclusionSystemPrompt,
  buildConclusionUserPrompt,
  formatTranscript,
  parseConclusionDraft,
  splitTranscript,
} from './meeting-conclusion-protocol';

export interface MeetingConclusionService {
  getConclusion(meetingId: string): MeetingConclusionView;
  generateConclusion(meetingId: string): Promise<MeetingConclusionView>;
  updateConclusion(meetingId: string, input: MeetingConclusionUpdateInput): MeetingConclusionView;
  listActionItems(meetingId: string): MeetingActionItemRecord[];
  createActionItem(meetingId: string, input: MeetingActionItemCreateInput): MeetingActionItemRecord;
  updateActionItem(
    meetingId: string,
    itemId: string,
    input: MeetingActionItemUpdateInput,
  ): MeetingActionItemRecord;
}

export interface MeetingConclusionServiceDeps {
  repo: MeetingRepositoryForConclusion;
  requireMeeting: (meetingId: string) => MeetingRecord;
  listMessages: (meetingId: string) => MeetingMessageRecord[];
  resolveTarget: MeetingServiceDeps['resolveTarget'];
  complete: MeetingServiceDeps['complete'];
  getMemberName: (assistantId: string) => string | null;
}

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['done', 'cancelled'],
  done: ['open'],
  cancelled: ['open'],
};

export function createMeetingConclusionService(
  deps: MeetingConclusionServiceDeps,
): MeetingConclusionService {
  const generating = new Set<string>();

  function view(meetingId: string): MeetingConclusionView {
    return {
      conclusion: deps.repo.getConclusion(meetingId),
      actionItems: deps.repo.listActionItems(meetingId),
    };
  }

  function assertOwner(meeting: MeetingRecord, ownerMemberId: string | null | undefined): string {
    if (!ownerMemberId) return '';
    if (!meeting.memberIds.includes(ownerMemberId)) {
      throw ApiError.validation('负责人不是本会议成员');
    }
    const name = deps.getMemberName(ownerMemberId);
    if (!name) throw ApiError.validation('负责人成员不存在或已删除');
    return name;
  }

  function sanitizeGeneratedItems(
    meeting: MeetingRecord,
    items: Array<{
      content: string;
      ownerLabel: string;
      ownerMemberId: string | null;
      dueAt: string | null;
    }>,
  ): Array<{
    content: string;
    ownerLabel: string;
    ownerMemberId: string | null;
    dueAt: string | null;
  }> {
    return items.map((item) => {
      const validId =
        item.ownerMemberId && meeting.memberIds.includes(item.ownerMemberId)
          ? item.ownerMemberId
          : null;
      const memberName = validId ? deps.getMemberName(validId) : null;
      return {
        ...item,
        ownerMemberId: memberName ? validId : null,
        ownerLabel: item.ownerLabel || memberName || '',
      };
    });
  }

  async function compressTranscript(meeting: MeetingRecord, messages: MeetingMessageRecord[]) {
    const chunks = splitTranscript(messages);
    const target = deps.resolveTarget(meeting.modelId);
    const summaries: string[] = [];
    for (const chunk of chunks) {
      if (chunk.startsWith('【中间转录过长')) {
        summaries.push(chunk);
        continue;
      }
      const summary = await deps.complete(target, {
        system: buildChunkSystemPrompt(),
        user: buildChunkUserPrompt(meeting, chunk),
      });
      if (summary.trim()) summaries.push(summary.trim());
    }
    return summaries.map((text, index) => `【片段 ${index + 1}】\n${text}`).join('\n\n');
  }

  return {
    getConclusion(meetingId) {
      deps.requireMeeting(meetingId);
      return view(meetingId);
    },

    async generateConclusion(meetingId) {
      const meeting = deps.requireMeeting(meetingId);
      if (meeting.status !== 'finished') {
        throw ApiError.conflict('会议结束后才能生成结论');
      }
      if (generating.has(meetingId)) {
        throw ApiError.conflict('结论正在生成，请稍候');
      }
      const messages = deps.listMessages(meetingId);
      if (messages.length === 0) throw ApiError.validation('会议没有可总结的内容');

      generating.add(meetingId);
      try {
        const members = meeting.memberIds
          .map((id) => ({ id, name: deps.getMemberName(id) }))
          .filter((m): m is { id: string; name: string } => Boolean(m.name));
        const transcript = formatTranscript(messages);
        const compressed = transcript.length > CONCLUSION_TRANSCRIPT_MAX_CHARS;
        const promptTranscript = compressed
          ? await compressTranscript(meeting, messages)
          : transcript;
        const target = deps.resolveTarget(meeting.modelId);
        const raw = await deps.complete(target, {
          system: buildConclusionSystemPrompt(),
          user: buildConclusionUserPrompt({
            meeting,
            members,
            transcript: promptTranscript,
            compressed,
          }),
        });
        const parsed = parseConclusionDraft(raw);
        if (!parsed.ok) {
          throw new ApiError('PROVIDER_ERROR', '结论生成失败：模型未返回合法结论 JSON', {
            reason: parsed.reason,
            issues: parsed.issues,
          });
        }

        deps.repo.saveGeneratedConclusion(
          {
            meetingId,
            summary: parsed.draft.summary,
            decisions: parsed.draft.decisions,
            openQuestions: parsed.draft.openQuestions,
            modelId: meeting.modelId ?? target.model.id,
          },
          sanitizeGeneratedItems(meeting, parsed.draft.actionItems),
        );
        return view(meetingId);
      } finally {
        generating.delete(meetingId);
      }
    },

    updateConclusion(meetingId, input) {
      deps.requireMeeting(meetingId);
      const updated = deps.repo.updateConclusion(meetingId, input);
      if (!updated) throw ApiError.notFound('会议结论', meetingId);
      return view(meetingId);
    },

    listActionItems(meetingId) {
      deps.requireMeeting(meetingId);
      return deps.repo.listActionItems(meetingId);
    },

    createActionItem(meetingId, input) {
      const meeting = deps.requireMeeting(meetingId);
      if (meeting.status !== 'finished') {
        throw ApiError.conflict('会议结束后才能添加行动项');
      }
      const memberName = assertOwner(meeting, input.ownerMemberId);
      const ownerLabel = input.ownerLabel || memberName;
      return deps.repo.createActionItem(meetingId, { ...input, ownerLabel });
    },

    updateActionItem(meetingId, itemId, input) {
      const meeting = deps.requireMeeting(meetingId);
      const existing = deps.repo.getActionItem(meetingId, itemId);
      if (!existing) throw ApiError.notFound('行动项', itemId);
      if (input.status && input.status !== existing.status) {
        const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status] ?? [];
        if (!allowed.includes(input.status)) {
          throw ApiError.conflict(`行动项不能从 ${existing.status} 变为 ${input.status}`);
        }
      }
      const memberName =
        input.ownerMemberId !== undefined ? assertOwner(meeting, input.ownerMemberId) : undefined;
      const ownerLabel =
        input.ownerMemberId !== undefined ? input.ownerLabel || memberName : input.ownerLabel;
      const updated = deps.repo.updateActionItem(meetingId, itemId, {
        ...input,
        ...(ownerLabel !== undefined ? { ownerLabel } : {}),
      });
      if (!updated) throw ApiError.notFound('行动项', itemId);
      return updated;
    },
  };
}
