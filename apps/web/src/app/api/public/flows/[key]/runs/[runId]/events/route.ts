import { createWorkflowRunRepository } from '@wbfm/database';
import { definePublicRoute } from '@/lib/server/public-route';
import { flowRunEventsResponse } from '@/lib/server/flow-run-sse';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/flows/:key/runs/:runId/events?after=<n>
 * 只读 SSE：进行中先补历史（after 之前的跳过）再接实时；终态一次性回放后关闭。
 * 永不影响执行：断开/多开都不取消 run。仅本端点触发的运行可订阅。
 */
export const GET = definePublicRoute<{ key: string; runId: string }>(
  'http',
  ({ request, params, services, endpoint }) => {
  const { runId } = params;
  const repo = createWorkflowRunRepository(services.db);
  const run = repo.getRun(runId);
  if (!run || run.endpointId !== endpoint.id) {
    return new Response('Not Found', { status: 404 });
  }
  const rawAfter = new URL(request.url).searchParams.get('after');
  const afterSeq = rawAfter === null ? undefined : Number(rawAfter);
  return flowRunEventsResponse({
    request,
    run,
    runs: repo,
    flowRunner: services.flowRunner,
    afterSeq,
  });
});
