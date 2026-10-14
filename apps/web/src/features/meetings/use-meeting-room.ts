'use client';

import * as React from 'react';
import { API } from '@/lib/api/endpoints';
import { apiGet, apiPost, apiSend, withManagedHeaders } from '@/lib/api/client';
import { SseReader, type RawSseEvent } from '@/lib/api/sse-reader';
import { useToast } from '@/components/common/toast';
import type { MeetingMode, MeetingStatus } from '@wbfm/shared/schemas';
import type { MeetingDetailView, MeetingMessageRecord } from '@wbfm/shared/types';

/**
 * v1.9 M3 会场数据：详情初始化 + 会议事件 SSE 增量。
 * 消息按 seq 去重归并；delta 只驱动「当前发言中」气泡，不落本地状态。
 */
const NAMES = new Set([
  'meeting_turn',
  'meeting_delta',
  'meeting_message',
  'meeting_status',
  'error',
]);

export interface MeetingRoomState {
  meeting: MeetingDetailView['meeting'] | null;
  members: MeetingDetailView['members'];
  messages: MeetingMessageRecord[];
  speaking: { speakerId: string; text: string } | null;
  loading: boolean;
}

export function useMeetingRoom(meetingId: string | null) {
  const toast = useToast();
  const [state, setState] = React.useState<MeetingRoomState>({
    meeting: null,
    members: [],
    messages: [],
    speaking: null,
    loading: true,
  });

  const upsertMessage = React.useCallback((message: MeetingMessageRecord) => {
    setState((s) => {
      if (s.messages.some((m) => m.id === message.id || m.seq === message.seq)) return s;
      return { ...s, messages: [...s.messages, message] };
    });
  }, []);

  React.useEffect(() => {
    if (!meetingId) return;
    let stopped = false;
    const signal = new AbortController();

    void (async () => {
      let detail: MeetingDetailView;
      try {
        detail = await apiGet<MeetingDetailView>(API.meeting(meetingId));
      } catch {
        if (!stopped) setState((s) => ({ ...s, loading: false }));
        return;
      }
      if (stopped) return;
      setState({
        meeting: detail.meeting,
        members: detail.members,
        messages: detail.messages,
        speaking: null,
        loading: false,
      });

      const response = await fetch(API.meetingEvents(meetingId), {
        ...withManagedHeaders(),
        signal: signal.signal,
      });
      if (!response.ok || !response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SseReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const raw of parser.feed(decoder.decode(value, { stream: true }))) {
          if (!NAMES.has(raw.event)) continue;
          if (raw.event === 'meeting_message') {
            const data = (raw as unknown as { data: { message: MeetingMessageRecord } }).data;
            upsertMessage(data.message);
            setState((s) => ({ ...s, speaking: null }));
          } else if (raw.event === 'meeting_delta') {
            const data = (raw as unknown as { data: { speakerId: string; content: string } }).data;
            setState((s) => ({ ...s, speaking: { speakerId: data.speakerId, text: data.content } }));
          } else if (raw.event === 'meeting_turn') {
            const data = (raw as unknown as { data: { speakerIds: string[] } }).data;
            const first = data.speakerIds[0];
            if (first) setState((s) => ({ ...s, speaking: { speakerId: first, text: '' } }));
          } else if (raw.event === 'meeting_status') {
            const data = (raw as unknown as {
              data: { status: MeetingStatus; mode: MeetingMode; autoRounds: number };
            }).data;
            setState((s) =>
              s.meeting
                ? {
                    ...s,
                    meeting: {
                      ...s.meeting,
                      status: data.status,
                      mode: data.mode,
                      autoRounds: data.autoRounds,
                    },
                    // 终态（结束/打断）清空可能悬挂的「发言中」气泡
                    speaking: data.status === 'active' ? s.speaking : null,
                  }
                : s,
            );
          } else if (raw.event === 'error') {
            const data = (raw as unknown as { data: { message: string } }).data;
            toast.error(data.message || '会议发言失败');
          }
        }
      }
    })();

    return () => {
      stopped = true;
      signal.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  const sendTurn = React.useCallback(
    async (content: string, mode: MeetingMode) => {
      if (!meetingId) return;
      // 服务端按 meeting.mode 决定下一位：先确保模式切换落库，再发本轮（避免竞态）
      if (state.meeting?.mode !== mode) {
        await apiSend('PATCH', API.meetingMode(meetingId), { mode }).catch(() => {});
      }
      await apiPost(API.meetingTurns(meetingId), { content });
    },
    [meetingId, state.meeting?.mode],
  );

  const setMode = React.useCallback(
    async (mode: MeetingMode) => {
      if (!meetingId) return;
      await apiSend('PATCH', API.meetingMode(meetingId), { mode });
      setState((s) => (s.meeting ? { ...s, meeting: { ...s.meeting, mode } } : s));
    },
    [meetingId],
  );

  const abort = React.useCallback(async () => {
    if (!meetingId) return;
    await apiPost(API.meetingAbort(meetingId));
  }, [meetingId]);

  const finish = React.useCallback(async () => {
    if (!meetingId) return;
    await apiPost(API.meetingFinish(meetingId));
  }, [meetingId]);

  return { state, sendTurn, setMode, abort, finish };
}
