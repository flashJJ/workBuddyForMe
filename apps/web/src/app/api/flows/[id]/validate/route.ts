import { flowGraphSchema, idParamSchema, type FlowDiagnostic } from '@wbfm/shared';
import { compileFlow } from '@wbfm/core';
import { createWorkflowRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/flows/:id/validate：只校验不保存。
 * body: { graph }（缺省时校验工作流当前版本图）。
 * 返回 { ok, diagnostics }，诊断带 nodeId/edgeId 供画布定位。
 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const body = await readJsonBody(request);
  let graph;
  if (body && typeof body === 'object' && 'graph' in body) {
    graph = flowGraphSchema.parse((body as { graph: unknown }).graph);
  } else {
    const repo = createWorkflowRepository(services.db);
    graph = repo.getCurrentVersion(id)?.graph;
    if (!graph) {
      return jsonOk<{ ok: boolean; diagnostics: FlowDiagnostic[] }>({
        ok: false,
        diagnostics: [
          { severity: 'error', code: 'flow/no-version', message: '工作流还没有已保存的图' },
        ],
      });
    }
  }
  const result = compileFlow(graph);
  return jsonOk({ ok: result.ok, diagnostics: result.diagnostics });
});
