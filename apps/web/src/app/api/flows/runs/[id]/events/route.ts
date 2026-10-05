import { idParamSchema } from '@wbfm/shared';
import { createWorkflowRunRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseParams } from '@/lib/server/validation';
import { flowRunEventsResponse } from '@/lib/server/flow-run-sse';

export const dynamic = 'force-dynamic';

/**
 * GET /api/flows/runs/:id/events：订阅工作流运行事件（v0.9 只读订阅）。
 * 执行由队列驱动，SSE 断开/多开均不取消运行；终态运行从 node_executions 回放。
 */
export const GET = defineRoute(({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const repo = createWorkflowRunRepository(services.db);
  const run = repo.getRun(id);
  if (!run) {
    return new Response('Not Found', { status: 404 });
  }
  return flowRunEventsResponse({
    request,
    run,
    runs: repo,
    flowRunner: services.flowRunner,
  });
});
