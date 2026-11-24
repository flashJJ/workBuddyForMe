import { ApiError } from '@wbfm/shared/errors';
import { idParamSchema } from '@wbfm/shared/schemas';
import type { FlowRunVersionCheck } from '@wbfm/shared/types';
import { diffRunGraph, parseRunGraphSnapshot } from '@wbfm/core/flow';
import { createWorkflowRunRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/flows/runs/:id：运行详情 + 逐节点执行记录 + v5.0 版本差异检查 */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const repo = createWorkflowRunRepository(services.db);
  const run = repo.getRun(id);
  if (!run) throw ApiError.notFound('工作流运行', id);
  const nodes = repo.listNodeExecutions(id);
  const snapshot =
    parseRunGraphSnapshot(repo.getGraphSnapshot(id)?.graphJson) ??
    services.workflows.getVersion(run.workflowId, run.version)?.graph ??
    null;
  const current = services.workflows.getProductionVersion(run.workflowId);
  const failedNodeId =
    nodes
      .filter((node) => node.status === 'failed')
      .at(-1)?.nodeId ?? null;
  const versionCheck: FlowRunVersionCheck = snapshot
    ? diffRunGraph({
        snapshot,
        current: current?.graph ?? null,
        runVersion: run.version,
        currentVersion: current?.version ?? null,
        failedNodeId,
      })
    : {
        runVersion: run.version,
        currentVersion: current?.version ?? null,
        addedNodeIds: [],
        removedNodeIds: [],
        changedNodeIds: [],
        canResumeFromFailedNode: false,
        reason: 'graph_unavailable',
      };
  return jsonOk({
    run,
    nodes,
    active: services.flowRunner.isActive(id),
    versionCheck,
  });
});
