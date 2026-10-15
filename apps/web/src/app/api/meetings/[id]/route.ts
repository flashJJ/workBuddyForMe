import { idParamSchema } from '@wbfm/shared/schemas';
import { ApiError } from '@wbfm/shared/errors';
import { jsonOk } from '@/lib/server/api-response';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/meetings/:id：会议详情（元数据 + 全量转录 + 成员实时名/悬空标注） */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const detail = services.meetings.getDetail(id);
  if (!detail) throw ApiError.notFound('会议', id);
  return jsonOk(detail);
});
