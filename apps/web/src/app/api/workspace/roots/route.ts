import { WORKSPACE_ROOTS_MAX } from '@wbfm/shared/constants';
import { workspaceRootsSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import type { ServiceContainer } from '@/lib/server/container-types';

export const dynamic = 'force-dynamic';

function payload(services: ServiceContainer) {
  return {
    roots: services.fileSafety.guard.listRoots(),
    defaultRoot: services.fileSafety.guard.defaultRoot,
    maxRoots: WORKSPACE_ROOTS_MAX,
  };
}

/** GET /api/workspace/roots：授权根列表与默认工作区 */
export const GET = defineRoute(({ services }) => jsonOk(payload(services)));

/** PUT /api/workspace/roots：更新用户追加根 */
export const PUT = defineRoute(async ({ request, services }) => {
  const body = parseBody(workspaceRootsSchema, await readJsonBody(request));
  services.fileSafety.guard.setRoots(body.roots);
  services.audit.safeAppend({
    kind: 'workspace_roots_updated',
    actor: 'user',
    reasonCode: 'workspace_roots_updated',
    outcome: JSON.stringify({ roots: body.roots }),
  });
  return jsonOk(payload(services));
});
