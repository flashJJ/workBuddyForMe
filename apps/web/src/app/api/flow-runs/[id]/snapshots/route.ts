import { ApiError } from '@wbfm/shared/errors';
import { idParamSchema } from '@wbfm/shared/schemas';
import { createWorkflowRunRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/flow-runs/[id]/snapshots：运行的文件快照清单与占用 */
export const GET = defineRoute(({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const runs = createWorkflowRunRepository(services.db);
  if (!runs.getRun(id)) throw ApiError.notFound('工作流运行', id);
  const nodeId = new URL(request.url).searchParams.get('nodeId') ?? undefined;
  return jsonOk({
    snapshots: services.fileSafety.snapshots.listByRun(id, nodeId ? { nodeId } : {}),
    usage: services.fileSafety.snapshotService.usage(),
  });
});
