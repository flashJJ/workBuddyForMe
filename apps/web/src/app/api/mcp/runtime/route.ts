import { checkMcpRuntime } from '@wbfm/core/mcp';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** v2.24：安装 MCP 服务器前的本机运行环境探测（Node / npx / uvx / Chrome） */
export const GET = defineRoute(async () => {
  return jsonOk(await checkMcpRuntime());
});
