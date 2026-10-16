import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { ApiError } from '@wbfm/shared/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { id: string };

/** GET /api/vrm-avatars/:id — 单条详情 */
export const GET = defineRoute<Params>(({ services, params }) => {
  const avatar = services.vrmAvatars.get(params.id);
  if (!avatar) throw ApiError.notFound('VRM 形象', params.id);
  return jsonOk({ avatar });
});

/** DELETE /api/vrm-avatars/:id — 删除并回收文件 */
export const DELETE = defineRoute<Params>(({ services, params }) => {
  services.vrmAvatars.delete(params.id);
  return jsonOk({ deleted: true });
});
