import { skillNameParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/skills/:name/versions：技能版本快照列表（`:name` 即路径段 id） */
export const GET = defineRoute(({ params, services }) => {
  const { name } = parseParams(skillNameParamSchema, { name: params.id });
  return jsonOk(services.skills.listVersions(name));
});
