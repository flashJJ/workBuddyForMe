import { z } from 'zod';
import { ApiError } from '@wbfm/shared/errors';
import { idParamSchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseParams, parseSearch } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

/** v2.20 M2：会议过程图快照（meeting scope 事件） */
export const GET = defineRoute(({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  if (!services.meetings.getDetail(id)) throw ApiError.notFound('会议', id);
  const query = parseSearch(querySchema, new URL(request.url));
  return jsonOk(services.runGraph.meetingGraph(id, query));
});
