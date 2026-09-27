// 测试夹具：最小 MCP stdio 服务器（newline-delimited JSON-RPC 2.0）。
// 仅实现 M1 协议面：initialize / tools/list / tools/call / ping，
// 并主动发一个 roots/list 请求验证客户端 -32601 应答路径。
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, terminal: false });

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

const TOOLS = [
  {
    name: 'echo',
    description: '原样返回输入文本',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: '要回显的文本' } },
      required: [],
    },
  },
  {
    name: 'bad name 带空格',
    description: '验证工具名规整化',
    inputSchema: { type: 'object', properties: {} },
  },
];

let initialized = false;

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (message.id === undefined || message.id === null) return; // 忽略通知

  switch (message.method) {
    case 'initialize':
      reply(message.id, {
        protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'mini-mcp', version: '1.0.0' },
      });
      initialized = true;
      break;
    case 'tools/list':
      if (!initialized) {
        send({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32600, message: 'not initialized' },
        });
        break;
      }
      reply(message.id, { tools: TOOLS });
      break;
    case 'tools/call': {
      const name = message.params?.name;
      if (name === 'echo') {
        const text = message.params?.arguments?.text ?? '';
        reply(message.id, {
          content: [{ type: 'text', text: `echo: ${text}` }],
          isError: false,
        });
      } else {
        reply(message.id, {
          content: [{ type: 'text', text: `未知工具 ${name}` }],
          isError: true,
        });
      }
      break;
    }
    case 'ping':
      reply(message.id, {});
      break;
    default:
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: `方法 ${message.method} 不存在` },
      });
  }
});

// 握手完成后主动发一个客户端不支持的请求，验证 -32601 应答闭环
setTimeout(() => {
  send({ jsonrpc: '2.0', id: 'srv-1', method: 'roots/list', params: {} });
}, 120);

// stderr 诊断通道（客户端可采集）
process.stderr.write('mini-mcp started\n');
