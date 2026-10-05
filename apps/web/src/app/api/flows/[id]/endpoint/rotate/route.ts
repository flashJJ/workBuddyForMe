import { ApiError, idParamSchema } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/flows/:id/endpoint/rotate：重置端点密钥。
 * 旧密钥即时失效；新明文仅本次响应返回，请提示调用方立即保存。
 */
export const POST = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  try {
    const result = services.endpoints.rotateKey(id);
    return jsonOk(result, 200);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'WORKFLOW_NOT_FOUND') throw ApiError.notFound('工作流', id);
    if (code === 'ENDPOINT_NOT_FOUND') {
      throw new ApiError('VALIDATION_ERROR', '端点尚未创建，请先开启对外暴露');
    }
    throw error;
  }
});
