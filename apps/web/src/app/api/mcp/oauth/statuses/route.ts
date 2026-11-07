import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** 当前所有 MCP 服务器的 OAuth 授权状态（仅返回脱敏信息） */
export const GET = defineRoute(({ services }) => {
  const alive = new Set(services.mcp.getServerInfos().map((server) => server.id));
  const statuses = services.mcpOAuth.statuses();
  return jsonOk(
    Object.fromEntries(Object.entries(statuses).filter(([id]) => alive.has(id))),
  );
});
