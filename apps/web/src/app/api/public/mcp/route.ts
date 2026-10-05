import { createWorkflowRepository } from '@wbfm/database';
import {
  createMcpFlowContext,
  handleMcpMessage,
  JSON_RPC_ERRORS,
  type JsonRpcMessage,
} from '@wbfm/core';
import { definePublicRoute } from '@/lib/server/public-route';
import { readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const;

function rpcErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  status = 400,
): Response {
  // 解析失败时 id 未知，按 JSON-RPC 规范允许 null
  const body: { jsonrpc: '2.0'; id: string | number | null; error: { code: number; message: string } } =
    { jsonrpc: '2.0', id, error: { code, message } };
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/**
 * POST /api/public/mcp：MCP streamable HTTP 承载（v1 无状态、单消息、无 SSE 响应流）。
 * 鉴权/Host/限流与 /invoke 同链（bearer=端点密钥，要求该端点开启 MCP 暴露）；
 * 通知类消息（notifications/initialized）返回 204 空体。
 */
export const POST = definePublicRoute('mcp', async ({ request, services, endpoint }) => {
  let message: JsonRpcMessage;
  try {
    const body = await readJsonBody(request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return rpcErrorResponse(null, JSON_RPC_ERRORS.PARSE_ERROR, '请求体不是合法的 JSON-RPC 对象');
    }
    message = body as JsonRpcMessage;
  } catch {
    return rpcErrorResponse(null, JSON_RPC_ERRORS.PARSE_ERROR, '请求体不是合法的 JSON');
  }

  const workflows = createWorkflowRepository(services.db);
  const context = createMcpFlowContext({
    endpoint,
    workflows,
    flowRunner: services.flowRunner,
  });
  services.endpoints.touch(endpoint.id);

  const response = await handleMcpMessage(message, context);
  if (!response) {
    // JSON-RPC 通知：无响应体（HTTP 204）
    return new Response(null, { status: 204 });
  }
  return new Response(JSON.stringify(response), { status: 200, headers: JSON_HEADERS });
});
