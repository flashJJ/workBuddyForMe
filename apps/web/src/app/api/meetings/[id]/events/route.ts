import { idParamSchema } from '@wbfm/shared/schemas';
import { ApiError } from '@wbfm/shared/errors';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseParams } from '@/lib/server/validation';
import { sseResponse } from '@/lib/server/sse-stream';
import type { MeetingEvent } from '@wbfm/core/meeting';

export const dynamic = 'force-dynamic';

/**
 * GET /api/meetings/:id/events：会议只读事件流（会场页/舞台共用）。
 * 连接先回放全量落库转录（meeting_message 帧）+ 当前状态，随后只收订阅后的新事件
 * （总线 live 订阅，历史不重复）。断线不影响会议执行（队列所有方在 POST /turns）。
 */
export const GET = defineRoute(async ({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const detail = services.meetings.getDetail(id);
  if (!detail) throw ApiError.notFound('会议', id);

  const replay: MeetingEvent[] = [
    ...detail.messages.map(
      (message): MeetingEvent => ({
        event: 'meeting_message',
        data: { meetingId: id, message },
      }),
    ),
    {
      event: 'meeting_status',
      data: {
        meetingId: id,
        status: detail.meeting.status,
        mode: detail.meeting.mode,
        autoRounds: detail.meeting.autoRounds,
      },
    },
  ];

  async function* stream(): AsyncGenerator<MeetingEvent> {
    for (const event of replay) yield event;
    const live = services.meetings.observe(id);
    if (!live) return;
    for await (const event of live) yield event;
  }

  return sseResponse(stream());
});
