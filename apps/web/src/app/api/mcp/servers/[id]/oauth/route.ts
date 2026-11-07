import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** 远程 MCP OAuth：查询授权状态 */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk(services.mcpOAuth.status(id));
});

/** 发起授权：返回授权页 URL，由前端打开系统浏览器 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const redirectUri = new URL('/api/mcp/oauth/callback', request.url).toString();
  return jsonOk(await services.mcpOAuth.start(id, redirectUri));
});

/** 清除授权：随后强制重连，让服务器状态回到未授权 */
export const DELETE = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.mcpOAuth.clear(id);
  void services.mcp.testServer(id).catch(() => undefined);
  return jsonOk({ id });
});
