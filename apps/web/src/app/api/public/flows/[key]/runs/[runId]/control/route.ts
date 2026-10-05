import { createWorkflowRunRepository } from '@wbfm/database';
import { definePublicRoute, publicJsonOk } from '@/lib/server/public-route';

export const dynamic = 'force-dynamic';

/**
 * POST /api/public/flows/:key/runs/:runId/control {action:'cancel'}
 * 取消本端点触发的运行（带密钥，与轮询同样的 endpoint_id 归属校验）。
 */
export const POST = definePublicRoute<{ key: string; runId: string }>(
  'http',
  async ({ request, params, services, endpoint }) => {
    const body = (await request.json().catch(() => null)) as { action?: string } | null;
    if (body?.action !== 'cancel') {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'validation_failed', message: "仅支持 action='cancel'" },
        }),
        { status: 422, headers: { 'content-type': 'application/json' } },
      );
    }
    const { runId } = params;
    const repo = createWorkflowRunRepository(services.db);
    const run = repo.getRun(runId);
    if (!run || run.endpointId !== endpoint.id) {
      return new Response('Not Found', { status: 404 });
    }
    const ok = services.flowRunner.cancel(runId);
    return publicJsonOk({ runId, cancelling: ok });
  },
);
