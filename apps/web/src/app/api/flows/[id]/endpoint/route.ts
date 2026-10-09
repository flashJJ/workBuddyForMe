import { ApiError } from '@wbfm/shared/errors';
import {
  flowEndpointUpsertSchema,
  idParamSchema,
  type FlowEndpointUpsertInput,
} from '@wbfm/shared/schemas';
import { createWorkflowRepository } from '@wbfm/database';
import { scanFlowDangerNodes } from '@wbfm/core/serving';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** 端点服务管理面错误码 → 统一 ApiError */
function mapEndpointError(error: unknown): never {
  const code = (error as { code?: string })?.code;
  if (code === 'WORKFLOW_NOT_FOUND') throw ApiError.notFound('工作流');
  if (code === 'ENDPOINT_NOT_FOUND') throw ApiError.notFound('对外端点');
  if (code === 'NO_EXPOSURE') {
    throw new ApiError('VALIDATION_ERROR', error instanceof Error ? error.message : '端点配置无效');
  }
  throw error;
}

/**
 * GET /api/flows/:id/endpoint：端点配置（不存在返回 null）+ 当前发布图危险节点清单。
 */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const workflows = createWorkflowRepository(services.db);
  if (!workflows.getWorkflow(id)) throw ApiError.notFound('工作流', id);
  const endpoint = services.endpoints.getByWorkflow(id);
  const version = workflows.getCurrentVersion(id);
  const dangerNodes = version ? scanFlowDangerNodes(version.graph, services.runtime) : [];
  return jsonOk({ endpoint, dangerNodes });
});

/**
 * PUT /api/flows/:id/endpoint：首次开启（建行+一次性返回明文密钥）或改配。
 * 仅已发布流程可开启暴露；两个暴露位不可同时关着建行。
 */
export const PUT = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const config = parseBody(
    flowEndpointUpsertSchema,
    await readJsonBody(request),
  ) as FlowEndpointUpsertInput;
  const workflows = createWorkflowRepository(services.db);
  const wf = workflows.getWorkflow(id);
  if (!wf) throw ApiError.notFound('工作流', id);
  if ((config.httpEnabled || config.mcpEnabled) && wf.status !== 'published') {
    throw ApiError.conflict('工作流尚未发布，请先发布后再开启对外服务');
  }
  try {
    const result = services.endpoints.createOrUpdate(id, config);
    return jsonOk(result, result.plaintextKey ? 201 : 200);
  } catch (error) {
    return mapEndpointError(error);
  }
});
