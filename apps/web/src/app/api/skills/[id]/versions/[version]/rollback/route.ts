import { skillVersionParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** POST /api/skills/:name/versions/:version/rollback：原子回退并保持启用态 */
export const POST = defineRoute(({ params, services }) => {
  const { name, version } = parseParams(skillVersionParamSchema, {
    name: params.id,
    version: params.version,
  });
  return jsonOk(services.skills.rollbackVersion(name, version));
});
