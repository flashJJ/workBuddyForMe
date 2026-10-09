import { createWorkflowRepository } from '@wbfm/database';
import {
  PublicEndpointError,
  readFlowStartFields,
  validateFlowStartInput,
} from '@wbfm/core/serving';
import { definePublicRoute, publicJsonOk } from '@/lib/server/public-route';
import { readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const ASYNC_HEADERS = { 'x-wbfm-async': '1' } as const;

/**
 * POST /api/public/flows/:key/invoke?mode=sync|async
 * 公开调用入口：bearer 端点密钥 → start 入参严格校验 → 入队（trigger=api）。
 * sync（默认）等待至端点同步超时：终态 200（业务失败也 200，读 status/error）；
 * 超时或 mode=async 返回 202 + runId，响应头 X-WBFM-Async: 1。
 */
export const POST = definePublicRoute<{ key: string }>('http', async ({ request, services, endpoint }) => {
  const mode = new URL(request.url).searchParams.get('mode') === 'async' ? 'async' : 'sync';
  const workflows = createWorkflowRepository(services.db);
  const version = workflows.getCurrentVersion(endpoint.workflowId);
  if (!version) {
    throw new PublicEndpointError('workflow_not_published', 409, '工作流没有已发布版本');
  }
  const input = validateFlowStartInput(
    readFlowStartFields(version.graph),
    await readJsonBody(request),
  );

  const runId = services.flowRunner.createRun({
    workflowId: endpoint.workflowId,
    input,
    trigger: 'api',
    endpointId: endpoint.id,
  });
  services.endpoints.touch(endpoint.id);

  if (mode === 'async') {
    return publicJsonOk({ runId, status: 'queued', async: true }, 202, ASYNC_HEADERS);
  }

  const result = await services.flowRunner.waitForTerminal(runId, endpoint.syncTimeoutMs);
  const run = result.run;
  if (result.timedOut || !run) {
    return publicJsonOk({ runId, status: 'queued', async: true }, 202, ASYNC_HEADERS);
  }
  // 业务失败仍是 HTTP 200（调用成功，读 status/error）；传输层错误才用 4xx
  return publicJsonOk({
    runId,
    status: run.status,
    ...(run.status === 'succeeded' ? { output: run.output } : {}),
    ...(run.error ? { error: run.error } : {}),
    ...(run.interruptReason ? { interruptReason: run.interruptReason } : {}),
  });
});
