import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createMcpHttpClient, parseSseDataFrames } from '../http-transport';

let server: Server | null = null;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
});

function listen(target: Server): Promise<number> {
  return new Promise((resolve) => {
    target.listen(0, '127.0.0.1', () => {
      const address = target.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
}

describe('MCP HTTP transport', () => {
  it('解析 SSE data 帧（兼容 CRLF 与多行 data）', () => {
    expect(
      parseSseDataFrames(
        'event: message\r\ndata: {"a":1}\r\n\r\ndata: {"b":\ndata: 2}\n\n: comment\n',
      ),
    ).toEqual(['{"a":1}', '{"b":\n2}']);
  });

  it('initialize 走 SSE 回包并携带会话头与协议版本', async () => {
    let sessionHeader: string | undefined;
    let protocolHeader: string | undefined;

    server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += String(chunk);
      });
      request.on('end', () => {
        if (request.method === 'DELETE') {
          response.writeHead(200).end();
          return;
        }
        const message = JSON.parse(body) as { id: number; method: string };
        if (message.method === 'initialize') {
          response.writeHead(200, {
            'content-type': 'text/event-stream',
            'mcp-session-id': 'sess-123',
          });
          response.end(
            `event: message\ndata: ${JSON.stringify({
              jsonrpc: '2.0',
              id: message.id,
              result: { protocolVersion: '2025-06-18', capabilities: {} },
            })}\n\n`,
          );
          return;
        }
        sessionHeader = request.headers['mcp-session-id'] as string | undefined;
        protocolHeader = request.headers['mcp-protocol-version'] as string | undefined;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              tools: [
                {
                  name: 'echo',
                  description: 'echo back',
                  inputSchema: { type: 'object', properties: {} },
                },
              ],
            },
          }),
        );
      });
    });

    const port = await listen(server);
    const client = createMcpHttpClient({ url: `http://127.0.0.1:${port}/mcp` });
    const init = await client.initialize();
    expect(init.protocolVersion).toBe('2025-06-18');

    const tools = await client.listTools('demo');
    expect(tools).toHaveLength(1);
    expect(tools[0]?.qualifiedName).toBe('mcp:demo:echo');
    expect(sessionHeader).toBe('sess-123');
    expect(protocolHeader).toBe('2025-06-18');
    await client.close();
  });

  it('401 时调用 OAuth refresh 并重试同一请求', async () => {
    let unauthorized = 0;
    let authorized = 0;
    server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += String(chunk);
      });
      request.on('end', () => {
        const message = JSON.parse(body) as { id: number };
        if (request.headers.authorization !== 'Bearer good') {
          unauthorized += 1;
          response.writeHead(401, {
            'www-authenticate': 'Bearer resource_metadata="http://127.0.0.1/.well-known/oauth-protected-resource"',
          });
          response.end();
          return;
        }
        authorized += 1;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: { protocolVersion: '2025-06-18', capabilities: {} },
          }),
        );
      });
    });
    const port = await listen(server);
    let refreshes = 0;
    const client = createMcpHttpClient({
      url: `http://127.0.0.1:${port}/mcp`,
      auth: {
        headers: async () => ({}),
        refresh: async () => {
          refreshes += 1;
          return { Authorization: 'Bearer good' };
        },
      },
    });
    await expect(client.initialize()).resolves.toMatchObject({ protocolVersion: '2025-06-18' });
    expect(unauthorized).toBe(1);
    expect(refreshes).toBe(1);
    expect(authorized).toBe(1);
  });

  it('401 给出可读鉴权错误', async () => {
    server = createServer((_request, response) => {
      response.writeHead(401).end('unauthorized');
    });
    const port = await listen(server);
    const client = createMcpHttpClient({ url: `http://127.0.0.1:${port}/mcp` });
    await expect(client.initialize()).rejects.toThrow(/要求鉴权/);
  });
});
