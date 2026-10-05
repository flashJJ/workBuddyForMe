import { createWorkflowRunRepository } from '@wbfm/database';
import { definePublicRoute, publicJsonOk } from '@/lib/server/public-route';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/flows/:key/runs/:runId：轮询运行状态/输出/错误/节点摘要。
 * 仅能读取本端点触发的运行（endpoint_id 隔离）；越权与不存在统一 404。
 */
export const GET = definePublicRoute<{ key: string; runId: string }>(
  'http',
  ({ params, services, endpoint }) => {
  const { runId } = params;
  const repo = createWorkflowRunRepository(services.db);
  const run = repo.getRun(runId);
  if (!run || run.endpointId !== endpoint.id) {
    return new Response('Not Found', { status: 404 });
  }
  const nodes = repo.listNodeExecutions(runId).map((node) => ({
    nodeId: node.nodeId,
    status: node.status,
    durationMs: node.durationMs,
    error: node.error,
    // v0.9：含 outputs 便于审计策略拒绝文本（[policy_deny:*]）与工具结果
    outputs: node.outputs,
  }));
  return publicJsonOk({
    runId: run.id,
    status: run.status,
    ...(run.status === 'succeeded' ? { output: run.output } : {}),
    ...(run.error ? { error: run.error } : {}),
    ...(run.interruptReason ? { interruptReason: run.interruptReason } : {}),
    ...(run.waitNodeId ? { waitNodeId: run.waitNodeId } : {}),
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    nodes,
  });
});
