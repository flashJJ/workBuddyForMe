import { idParamSchema, meetingConclusionUpdateSchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/meetings/:id/conclusion：结论 + 行动项（无结论时 conclusion=null） */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk(services.meetings.getConclusion(id));
});

/** POST /api/meetings/:id/conclusion：对 finished 会议生成结构化结论 */
export const POST = defineRoute(async ({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk(await services.meetings.generateConclusion(id));
});

/** PATCH /api/meetings/:id/conclusion：编辑结论正文（不包含行动项） */
export const PATCH = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(meetingConclusionUpdateSchema, await readJsonBody(request));
  return jsonOk(services.meetings.updateConclusion(id, input));
});
