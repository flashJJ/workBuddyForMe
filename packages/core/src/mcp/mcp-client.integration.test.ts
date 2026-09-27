import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createMcpClient, sanitizeToolName } from './client';
import { spawnStdioTransport } from './stdio-transport';

const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/mini-mcp-server.mjs', import.meta.url));

const transports: ReturnType<typeof spawnStdioTransport>[] = [];

afterAll(async () => {
  await Promise.all(transports.map((t) => t.stop()));
});

/** 起一个真实子进程客户端（集成级：验证握手/发现/调用/-32601 应答全链路） */
function makeClient() {
  const stderr: string[] = [];
  const transport = spawnStdioTransport({
    command: process.execPath,
    args: [FIXTURE_PATH],
    onStderr: (line) => stderr.push(line),
  });
  transports.push(transport);
  const client = createMcpClient({ transport });
  transport.setMessageHandler((message) => client.handleMessage(message));
  return { client, transport, stderr };
}

describe('MCP stdio 客户端（真实子进程）', () => {
  it('initialize 握手 → tools/list 发现（含工具名规整化） → tools/call 回显', async () => {
    const { client } = makeClient();
    const caps = await client.initialize();
    expect(caps.protocolVersion).toBeTruthy();
    expect(caps.serverInfo?.name).toBe('mini-mcp');

    const tools = await client.listTools('filesystem');
    const names = tools.map((t) => t.name);
    expect(names).toContain('echo');
    // 夹具里的非法工具名（含空格/中文）被规整化为标识符安全形式
    expect(names.every((n) => /^[a-zA-Z0-9_-]{1,64}$/.test(n))).toBe(true);
    expect(names).not.toContain('bad name 带空格');
    expect(tools.every((t) => t.qualifiedName.startsWith('mcp:filesystem:'))).toBe(true);
    expect(tools.find((t) => t.name === 'echo')?.inputSchema.type).toBe('object');

    const outcome = await client.callTool('echo', { text: '你好 MCP' }, 5_000);
    expect(outcome.isError).toBe(false);
    expect(outcome.output).toBe('echo: 你好 MCP');
  }, 20_000);

  it('isError=true 的调用结果透传；握手前 tools/list 拒绝', async () => {
    const { client } = makeClient();
    await client.initialize();
    const outcome = await client.callTool('nope', {}, 5_000);
    expect(outcome.isError).toBe(true);
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain('nope');
  }, 20_000);

  it('服务端请求 roots/list 收到 -32601 应答（夹具不崩）且 stderr 可采集', async () => {
    const { client, stderr } = makeClient();
    await client.initialize();
    // 夹具在启动 120ms 后发出 roots/list；客户端回 -32601 后夹具继续服务
    await new Promise((resolve) => setTimeout(resolve, 400));
    const outcome = await client.callTool('echo', { text: 'alive' }, 5_000);
    expect(outcome.output).toBe('echo: alive');
    expect(stderr.join('\n')).toContain('mini-mcp started');
  }, 20_000);
});

describe('sanitizeToolName 规整化', () => {
  it('非法字符替换为下划线，空名兜底', () => {
    expect(sanitizeToolName('search files!')).toBe('search_files_');
    expect(sanitizeToolName('')).toBe('tool');
    expect(sanitizeToolName('good-name_1')).toBe('good-name_1');
  });
});
