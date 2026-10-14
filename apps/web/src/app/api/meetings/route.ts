import { meetingCreateSchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** POST /api/meetings：发起会议（成员 2–4、共用模型预检）；GET：列表（新→旧） */
export const GET = defineRoute(({ services }) => {
  return jsonOk(services.meetings.list());
});

export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(meetingCreateSchema, await readJsonBody(request));
  const meeting = services.meetings.create(input);
  return jsonOk(meeting, 201);
});
