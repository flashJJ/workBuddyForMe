import { toolDebugExecuteSchema } from '@wbfm/shared';
import { debugExecuteTool } from '@wbfm/core';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/tools/debug：列出全部可调试工具元数据（内置 + MCP） */
export const GET = defineRoute(({ services }) => {
  return jsonOk(services.runtime.listDebugTools());
});

/** POST /api/tools/debug：选定工具填参试跑，返回结构化结果（不经熔断/HITL） */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(toolDebugExecuteSchema, await readJsonBody(request));
  // POST 路由共用前端 AbortController；服务端为单个调试请求不必显式超时
  // （executeToolCall 内部已按 source 适配 15s/60s）
  const result = await debugExecuteTool({
    runtime: services.runtime,
    name: input.name,
    args: input.args,
  });
  return jsonOk(result);
});
