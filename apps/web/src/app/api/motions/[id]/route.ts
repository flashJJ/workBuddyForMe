import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { ApiError } from '@wbfm/shared/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { id: string };

/** GET /api/motions/:id — 单条详情 */
export const GET = defineRoute<Params>(({ services, params }) => {
  const motion = services.motions.get(params.id);
  if (!motion) throw ApiError.notFound('待机动作', params.id);
  return jsonOk({ motion });
});

/** DELETE /api/motions/:id — 删除并回收文件 */
export const DELETE = defineRoute<Params>(({ services, params }) => {
  services.motions.delete(params.id);
  return jsonOk({ deleted: true });
});
