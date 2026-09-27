import { idParamSchema, skillUpdateSchema } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** PATCH /api/skills/:id：启停切换 */
export const PATCH = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(skillUpdateSchema, await readJsonBody(request));
  return jsonOk(services.skills.setEnabled(id, input.enabled));
});

/** DELETE /api/skills/:id：删除引用（只删状态行，源文件夹保留） */
export const DELETE = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.skills.remove(id);
  return jsonOk({ id });
});
