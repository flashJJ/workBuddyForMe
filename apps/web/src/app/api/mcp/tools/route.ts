import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** 已连接 MCP 服务器的工具清单（助手表单工具分组使用） */
export const GET = defineRoute(({ services }) => {
  return jsonOk(services.mcp.getTools());
});
