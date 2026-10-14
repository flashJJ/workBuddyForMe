'use client';

import * as React from 'react';
import { API } from '@/lib/api/endpoints';
import { apiGet, withManagedHeaders } from '@/lib/api/client';
import { SseReader, type RawSseEvent } from '@/lib/api/sse-reader';
import type { MeetingMode, MeetingStatus } from '@wbfm/shared/schemas';
import type { MeetingDetailView } from '@wbfm/shared/types';
import {
  adaptMeetingFrame,
  createMeetingAdapterState,
  createMeetingCast,
  type MeetingAdapterState,
} from '@wbfm/core/stage-client';
import type { StageController } from './use-stage-controller';

/**
 * v1.9 M3：舞台只读订阅会议（?meeting=<id>）。
 * 开场用详情成员建 assistant cast；事件帧经纯映射落到舞台。
 * 与协作 run 同构：只有观察，没有任何会议控制权（打断/调度在会场页）。
 */

const MEETING_EVENT_NAMES = new Set<RawSseEvent['event']>([
  'meeting_turn',
  'meeting_delta',
  'meeting_message',
  'meeting_status',
  'error',
]);

type MeetingFrame = Parameters<typeof adaptMeetingFrame>[1];

export type MeetingStageState = {
  status: MeetingStatus | 'connecting';
  mode: MeetingMode | null;
  autoRounds: number;
  memberCount: number;
};

function narrow(raw: RawSseEvent): MeetingFrame | null {
  return MEETING_EVENT_NAMES.has(raw.event) ? (raw as unknown as MeetingFrame) : null;
}

export function useMeetingStage(
  meetingId: string | null,
  controller: StageController,
): MeetingStageState {
  const [state, setState] = React.useState<MeetingStageState>({
    status: 'connecting',
    mode: null,
    autoRounds: 0,
    memberCount: 0,
  });
  const adapterRef = React.useRef<MeetingAdapterState | null>(null);

  React.useEffect(() => {
    if (!meetingId) return;
    let stopped = false;
    const signal = new AbortController();

    void (async () => {
      // 1) 详情建 cast（含终态转录，SSE 首帧会回放，故不在这里灌台词）
      let detail: MeetingDetailView | null = null;
      try {
        detail = await apiGet<MeetingDetailView>(API.meeting(meetingId));
      } catch {
        if (!stopped) setState((s) => ({ ...s, status: 'aborted' }));
        return;
      }
      if (stopped || !detail) return;
      const presentMembers = detail.members.filter((m) => !m.missing);
      const cast = createMeetingCast(presentMembers);
      adapterRef.current = createMeetingAdapterState(presentMembers);
      for (const d of [{ t: 'cast', members: cast }] as const) controller.applyDirection(d);
      setState({
        status: detail.meeting.status,
        mode: detail.meeting.mode,
        autoRounds: detail.meeting.autoRounds,
        memberCount: presentMembers.length,
      });

      // 2) 事件流（服务端先回放落库，再 live）
      const response = await fetch(API.meetingEvents(meetingId), {
        ...withManagedHeaders(),
        signal: signal.signal,
      });
      if (!response.ok || !response.body) {
        setState((s) => ({ ...s, status: detail!.meeting.status }));
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SseReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const raw of parser.feed(decoder.decode(value, { stream: true }))) {
          const frame = narrow(raw);
          if (!frame || !adapterRef.current) continue;
          if (frame.event === 'meeting_status') {
            setState((s) => ({
              ...s,
              status: frame.data.status,
              mode: frame.data.mode,
              autoRounds: frame.data.autoRounds,
            }));
          }
          for (const direction of adaptMeetingFrame(adapterRef.current, frame)) {
            controller.applyDirection(direction);
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

  return state;
}
