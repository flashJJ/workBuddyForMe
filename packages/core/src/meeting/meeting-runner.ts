/**
 * v1.9 M3 会议一轮发言执行器：串行模型调用 + 落库 + 事件广播。
 * 纯执行单元：调度决策（manual/all/auto 序列与校验）在 meeting-service，
 * 转录/system 构建与截断在 meeting-protocol。同一时刻单调用、单 AbortSignal。
 */
import type { MeetingMode } from '@wbfm/shared/schemas';
import { MEETING_LIMITS } from '@wbfm/shared/schemas';
import type { MeetingMessageRecord, MeetingRecord } from '@wbfm/shared/types';
import type { MeetingRepository } from '@wbfm/database';
import { zhCN } from '@wbfm/shared/i18n';
import type { RunEventBus } from '../agents/run-event-bus';
import type { MeetingServiceDeps } from './meeting-types';
import type { MeetingEvent } from './meeting-types';
import {
  buildMeetingSystem,
  buildTranscriptLines,
  clipSpeech,
  extractAutoSuggestion,
  validateAutoNext,
} from './meeting-protocol';

const TEMPLATES = zhCN.meeting.system;
const USER_LABEL = TEMPLATES.userLabel;

export interface RunTurnOptions {
  meeting: MeetingRecord;
  /** 用户这一轮已落库的消息（system 转录之外的本轮锚点来源） */
  userContent: string;
  mode: MeetingMode;
  /** manual：@ 序列；all：全成员；auto：接龙首位（service 已决策） */
  initialSpeakerIds: string[];
  signal: AbortSignal;
  /** 单个成员发言失败时的错误出口（不杀会议，本轮停止） */
  onSpeakerError: (speakerId: string, message: string) => void;
}

/** 执行结果：auto 接龙是否耗尽/被拒（service 据此收回 manual） */
export interface RunTurnResult {
  endedChain: boolean;
}

/**
 * 跑一轮（可能含多位串行发言者）。
 * auto 模式每收完一条即做下一位校验，非法建议终止接龙。
 */
export async function runMeetingTurn(
  deps: MeetingServiceDeps,
  repo: MeetingRepository,
  bus: Pick<RunEventBus<MeetingEvent>, 'publish'>,
  options: RunTurnOptions,
): Promise<RunTurnResult> {
  const { meeting, mode, signal } = options;
  const queue = [...options.initialSpeakerIds];
  const speakerIds = meeting.memberIds;
  let previousAssistantSpeaker: string | null = null;
  let endedChain = false;

  const emit = (event: MeetingEvent): void => bus.publish(event);
  const statusEvent = (
    status: MeetingRecord['status'],
    nextMode: MeetingMode,
    autoRounds: number,
  ): MeetingEvent => ({
    event: 'meeting_status',
    data: { meetingId: meeting.id, status, mode: nextMode, autoRounds },
  });

  const persistAssistant = (
    speakerId: string,
    content: string,
  ): MeetingMessageRecord => {
    const name = deps.getMemberName(speakerId) ?? '';
    const clipped = clipSpeech(content);
    const message = repo.appendMessage({
      meetingId: meeting.id,
      speakerKind: 'assistant',
      speakerId,
      speakerName: name,
      content: clipped.text,
      emotionTag: null,
      truncated: clipped.truncated,
    });
    emit({ event: 'meeting_message', data: { meetingId: meeting.id, message } });
    return message;
  };

  while (queue.length > 0) {
    if (signal.aborted) throw new Error('aborted');
    const speakerId = queue.shift()!;
    const selfName = deps.getMemberName(speakerId);
    if (!selfName || !speakerIds.includes(speakerId)) {
      // 成员在执行期被删除/越权 id：跳过且不调模型
      endedChain = true;
      break;
    }

    const autoRoundsNow = repo.findById(meeting.id)?.autoRounds ?? meeting.autoRounds;
    // auto 首位（用户发起的接龙第一人）计第 1 轮；后续轮次由建议校验通过后累加。
    // 这样总助手发言数硬顶 8（首位 + 7 次建议），第 8 位后的任何建议都被拒绝。
    if (mode === 'auto' && previousAssistantSpeaker === null && autoRoundsNow === 0) {
      repo.addAutoRound(meeting.id);
    }
    emit({
      event: 'meeting_turn',
      data: {
        meetingId: meeting.id,
        mode,
        speakerIds: [speakerId],
        autoRounds: repo.findById(meeting.id)?.autoRounds ?? 1,
      },
    });

    // 每一次调用都从落库转录重建 [system, user]，永不制造假多轮
    const transcript = buildTranscriptLines(
      repo.listMessages(meeting.id).map((m) => ({
        speakerKind: m.speakerKind,
        speakerName: m.speakerName,
        content: m.content,
      })),
    );
    const system = buildMeetingSystem({
      selfName,
      userLabel: USER_LABEL,
      personaBlock: deps.getPersonaBlock(speakerId),
      transcriptLines: transcript,
      identityRuleTemplate: TEMPLATES.identityRule,
      lengthRule: TEMPLATES.lengthRule,
    });
    const userContent = buildUserAnchor(mode, options.userContent, previousAssistantSpeaker === null);

    let raw = '';
    try {
      const target = deps.resolveTarget(meeting.modelId);
      const speaker = deps.createSpeaker(target, speakerId);
      const result = await speaker.speak({
        system,
        userContent,
        signal,
        onDelta: (full) => {
          emit({
            event: 'meeting_delta',
            data: { meetingId: meeting.id, speakerId, content: full },
          });
        },
      });
      raw = result.content;
    } catch (error) {
      if (signal.aborted) throw error;
      options.onSpeakerError(speakerId, error instanceof Error ? error.message : '模型调用失败');
      endedChain = mode === 'auto';
      break;
    }

    // auto：剥离尾部 JSON 建议后再落库（标记块不是发言内容）
    const parsed = mode === 'auto' ? extractAutoSuggestion(raw) : { speech: raw, nextSpeakerName: null };
    persistAssistant(speakerId, parsed.speech);

    if (mode === 'all') {
      previousAssistantSpeaker = speakerId;
      continue;
    }
    if (mode === 'manual') {
      // manual 队列可能含多位 @ 成员，逐位串行（不做建议、不追加），继续下一位
      previousAssistantSpeaker = speakerId;
      continue;
    }

    // auto 接龙：服务端校验下一位
    const updated = repo.findById(meeting.id)!;
    const decision = validateAutoNext({
      suggestedName: parsed.nextSpeakerName,
      members: speakerIds
        .map((id) => ({ id, name: deps.getMemberName(id) ?? '' }))
        .filter((m) => m.name),
      currentSpeakerId: speakerId,
      previousSpeakerId: previousAssistantSpeaker,
      nextRound: updated.autoRounds + 1,
    });
    previousAssistantSpeaker = speakerId;
    if (decision.ok && updated.autoRounds + 1 <= MEETING_LIMITS.AUTO_ROUNDS_MAX) {
      repo.addAutoRound(meeting.id);
      queue.push(decision.speakerId);
    } else {
      endedChain = true;
      break;
    }
  }

  if (mode === 'all') {
    repo.updateMode(meeting.id, 'manual');
    emit(statusEvent('active', 'manual', repo.findById(meeting.id)?.autoRounds ?? 0));
  } else if (mode === 'auto' && endedChain) {
    repo.updateMode(meeting.id, 'manual');
    emit(statusEvent('active', 'manual', repo.findById(meeting.id)?.autoRounds ?? 0));
  }
  return { endedChain };
}

/** 本轮唯一 user 锚点内容：all/auto 包调度指令，manual 原样（含 @ 文本） */
function buildUserAnchor(mode: MeetingMode, content: string, isFirst: boolean): string {
  if (mode === 'all') return `${TEMPLATES.allDirective}\n\n本轮议题/追问：${content}`;
  if (mode === 'auto') {
    return isFirst
      ? `${TEMPLATES.autoDirective}\n\n议题：${content}`
      : `${TEMPLATES.autoDirective}\n\n请就上面的最新转录继续发言。`;
  }
  return content;
}
