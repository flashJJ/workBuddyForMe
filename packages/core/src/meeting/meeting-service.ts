/**
 * v1.9 M3 会议服务（docs/plan/v1.9/03）：
 * - 新表新调度，与 v1.4 协作分账；成员是 2–4 个真实助手，模型会议共用；
 * - 「下一位」永远由服务端纯函数决定，不接受客户端自由 speaker id；
 * - 同一时刻单请求单 AbortController：提交新轮次 409，打断/结束即 abort；
 * - 执行不绑 SSE 生命周期：POST /turns 触发后异步跑，事件进会议总线，
 *   会场页/舞台都是只读观察者，断线/关窗不杀会议。
 */
import { createMeetingRepository, type MeetingRepository } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import type { MeetingCreateInput, MeetingMode } from '@wbfm/shared/schemas';
import { MEETING_LIMITS } from '@wbfm/shared/schemas';
import type { MeetingDetailView, MeetingRecord } from '@wbfm/shared/types';
import { createRunEventBus, type RunEventBus } from '../agents/run-event-bus';
import { parseMentionNames, mapMentionsToIds } from './meeting-protocol';
import { runMeetingTurn } from './meeting-runner';
import type { MeetingEvent, MeetingService, MeetingServiceDeps, SubmitTurnResult } from './meeting-types';

interface ActiveTurn {
  abort: AbortController;
}

/** 会议事件总线缓冲：长连跨多轮，历史由落库回放，缓冲只兜订阅瞬间积压 */
const MEETING_BUS_MAX_BUFFER = 200;

export function createMeetingService(deps: MeetingServiceDeps): MeetingService {
  const repo: MeetingRepository = createMeetingRepository(deps.db);
  const buses = new Map<string, RunEventBus<MeetingEvent>>();
  const active = new Map<string, ActiveTurn>();

  function busFor(meetingId: string): RunEventBus<MeetingEvent> {
    let bus = buses.get(meetingId);
    if (!bus) {
      bus = createRunEventBus<MeetingEvent>({ maxBuffer: MEETING_BUS_MAX_BUFFER });
      buses.set(meetingId, bus);
    }
    return bus;
  }

  function requireMeeting(id: string): MeetingRecord {
    const meeting = repo.findById(id);
    if (!meeting) throw ApiError.notFound('会议', id);
    return meeting;
  }

  function assertMembers(input: MeetingCreateInput): void {
    const seen = new Set<string>();
    for (const memberId of input.memberIds) {
      if (seen.has(memberId)) throw new ApiError('VALIDATION_ERROR', '成员不能重复');
      seen.add(memberId);
      const name = deps.getMemberName(memberId);
      if (!name) throw new ApiError('VALIDATION_ERROR', `成员不存在或已删除：${memberId}`);
    }
    // 会议共用模型必须可解析（成员未配模型时跟随系统默认，此处统一预检快速失败）
    deps.resolveTarget(input.modelId ?? null);
  }

  function publish(meetingId: string, event: MeetingEvent): void {
    buses.get(meetingId)?.publish(event);
  }

  return {
    create(input) {
      assertMembers(input);
      return repo.create({
        topic: input.topic,
        memberIds: input.memberIds,
        mode: input.mode,
        modelId: input.modelId ?? null,
      });
    },

    list() {
      return repo.list();
    },

    getDetail(id) {
      const meeting = repo.findById(id);
      if (!meeting) return null;
      const messages = repo.listMessages(id);
      const members = meeting.memberIds.map((memberId) => {
        const name = deps.getMemberName(memberId);
        return name ? { id: memberId, name } : { id: memberId, name: '', missing: true };
      });
      return { meeting, messages, members };
    },

    updateMode(meetingId, mode: MeetingMode) {
      const meeting = requireMeeting(meetingId);
      if (meeting.status !== 'active') throw ApiError.conflict('会议已结束，不能切换调度');
      repo.updateMode(meetingId, mode);
      publish(meetingId, {
        event: 'meeting_status',
        data: {
          meetingId,
          status: meeting.status,
          mode,
          autoRounds: repo.findById(meetingId)?.autoRounds ?? 0,
        },
      });
    },

    submitTurn(meetingId, content): SubmitTurnResult {
      const meeting = requireMeeting(meetingId);
      if (meeting.status !== 'active') throw ApiError.conflict('会议已结束');
      if (active.has(meetingId)) throw ApiError.conflict('上一位成员还在发言，请稍候');
      if (content.length > MEETING_LIMITS.TURN_CONTENT_MAX) {
        throw new ApiError('VALIDATION_ERROR', '发言过长');
      }

      const members = meeting.memberIds
        .map((id) => ({ id, name: deps.getMemberName(id) }))
        .filter((m): m is { id: string; name: string } => Boolean(m.name));

      // 下一位发言者：服务端纯函数决策，前端不能直接指定
      let speakerIds: string[] = [];
      if (meeting.mode === 'manual') {
        const names = parseMentionNames(content);
        speakerIds = mapMentionsToIds(names, members);
      } else if (meeting.mode === 'all') {
        speakerIds = [...meeting.memberIds];
      } else {
        speakerIds = [meeting.memberIds[0]!];
      }

      // 用户消息先落库（manual 无 @ 也留存，只是不调模型）
      const userMessage = repo.appendMessage({
        meetingId,
        speakerKind: 'user',
        speakerId: null,
        speakerName: '用户',
        content,
      });
      publish(meetingId, {
        event: 'meeting_message',
        data: { meetingId, message: userMessage },
      });

      if (speakerIds.length === 0) return { triggered: false, speakerIds: [] };

      const abort = new AbortController();
      active.set(meetingId, { abort });
      const bus = busFor(meetingId);
      const run = meeting;

      void (async () => {
        try {
          await runMeetingTurn(
            deps,
            repo,
            bus,
            {
              meeting: run,
              userContent: content,
              mode: run.mode,
              initialSpeakerIds: speakerIds,
              signal: abort.signal,
              onSpeakerError: (_speakerId, message) => {
                bus.publish({
                  event: 'error',
                  data: { code: 'MEETING_SPEAK_FAILED', message },
                });
              },
            },
          );
        } catch (error) {
          if (!abort.signal.aborted) {
            // 非打断异常：会议保持 active，发 error 帧让会场提示，不静默吞
            bus.publish({
              event: 'error',
              data: {
                code: 'MEETING_TURN_FAILED',
                message: error instanceof Error ? error.message : '会议发言失败',
              },
            });
          }
        } finally {
          active.delete(meetingId);
        }
      })();

      return { triggered: true, speakerIds };
    },

    finish(meetingId) {
      const meeting = requireMeeting(meetingId);
      if (meeting.status !== 'active') return;
      active.get(meetingId)?.abort.abort();
      repo.finalize(meetingId, 'finished');
      publish(meetingId, {
        event: 'meeting_status',
        data: {
          meetingId,
          status: 'finished',
          mode: repo.findById(meetingId)?.mode ?? meeting.mode,
          autoRounds: repo.findById(meetingId)?.autoRounds ?? 0,
        },
      });
      buses.get(meetingId)?.close();
    },

    abort(meetingId) {
      const meeting = repo.findById(meetingId);
      if (!meeting) return;
      active.get(meetingId)?.abort.abort();
      if (meeting.status === 'active') {
        repo.finalize(meetingId, 'aborted');
        publish(meetingId, {
          event: 'meeting_status',
          data: {
            meetingId,
            status: 'aborted',
            mode: meeting.mode,
            autoRounds: meeting.autoRounds,
          },
        });
        buses.get(meetingId)?.close();
      }
    },

    isActive(meetingId) {
      return active.has(meetingId);
    },

    observe(meetingId) {
      if (!repo.findById(meetingId)) return null;
      return busFor(meetingId).subscribeLive();
    },
  };
}

export type { MeetingDetailView };
