import { getServices } from '@/lib/server/container';

export const dynamic = 'force-dynamic';

/**
 * OAuth 回调页。
 * 浏览器从授权服务器跳回本机服务，不带托管令牌，因此这里不走 defineRoute 的 token guard；
 * CSRF 由一次性 state（加密存储、10 分钟过期）保证。
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPage(ok: boolean, title: string, detail: string): Response {
  const color = ok ? '#16a34a' : '#dc2626';
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MCP 授权</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #0b0f17; color: #e5e7eb;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { width: min(92vw, 460px); padding: 32px; border: 1px solid #26303f;
    border-radius: 14px; background: #111827; }
  h1 { margin: 0 0 12px; font-size: 20px; color: ${color}; }
  p { margin: 0 0 20px; line-height: 1.7; color: #9ca3af; word-break: break-word; }
  button { width: 100%; padding: 10px 14px; border: 1px solid #374151; border-radius: 8px;
    background: #1f2937; color: #e5e7eb; font-size: 14px; cursor: pointer; }
  button:hover { background: #374151; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(detail)}</p>
  <button onclick="window.close()">关闭此页</button>
</main>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');
  if (error) {
    return renderPage(
      false,
      '授权未完成',
      `${error}${errorDescription ? `：${errorDescription}` : ''}`,
    );
  }
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const iss = url.searchParams.get('iss');
  if (!code || !state) {
    return renderPage(false, '授权失败', '回调缺少 code 或 state 参数');
  }

  try {
    const services = getServices();
    const { serverId } = await services.mcpOAuth.handleCallback({ code, state, iss });
    const info = await services.mcp.testServer(serverId).catch(() => null);
    if (!info) {
      return renderPage(true, '授权已保存', '服务器连接检查失败，请回到应用点「测试连接」。');
    }
    if (info.status === 'connected') {
      return renderPage(
        true,
        '授权完成',
        `已连接「${info.name}」，发现 ${info.toolCount} 个工具。可以关闭此页面并回到应用。`,
      );
    }
    if (info.status === 'disconnected') {
      return renderPage(true, '授权已保存', '服务器当前未启用，请回到应用启用后再试。');
    }
    return renderPage(
      true,
      '授权已保存',
      `服务器连接失败：${info.statusDetail ?? '未知原因'}。请回到应用重试「测试连接」。`,
    );
  } catch (caught) {
    return renderPage(false, '授权失败', caught instanceof Error ? caught.message : String(caught));
  }
}
