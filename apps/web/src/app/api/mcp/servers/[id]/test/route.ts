import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mcp/servers/[id]/test：手动测试连接（v2.3 P1-3）。
 * 与「启用」不同：这里断开后重连并等待终态，把 status/statusDetail/工具数直接回报给前端，
 * 便于一键判断配置是否正确。未启用服务器不建立连接，返回现状由前端提示先启用。
 */
export const POST = defineRoute(async ({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk(await services.mcp.testServer(id));
});
