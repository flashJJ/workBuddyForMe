import { branchCreateSchema, idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v2.21：父会话分支列表 + 会话树预算；?includeArchived=true 含归档 */
export const GET = defineRoute(({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
  return jsonOk({
    branches: services.branches.list(id, includeArchived),
    budget: services.branches.budget(id),
  });
});

/** v2.21：派生分支；autoStart 缺省 false，由 start 触发运行 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(branchCreateSchema, await readJsonBody(request));
  return jsonOk(services.branches.create(id, input), 201);
});
