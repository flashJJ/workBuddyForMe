// eval 夹具：返回超大结构化 JSON 的 MCP stdio 服务器（v1.1 M5 eval-tool-compact）。
// 协议面与 packages/core fixtures/mini-mcp-server.mjs 一致（newline JSON-RPC 2.0）。
// big_json 返回顶层数组（默认 600 条 ~120KB），驱动压缩器：
// - 顶层数组头部取样（__omitted 标记）；
// - 每条含 id/code/status 身份字段（末级降级也保留）+ 长 payload（叶子裁剪）。
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, terminal: false });

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

const ANCHOR_ID = 'WBFM-ANCHOR-0001';

/** 构造一条稳定记录：身份字段 + 足够长的 payload 触发叶子裁剪 */
function makeItem(index) {
  const seq = String(index + 1).padStart(4, '0');
  const payload =
    `订单批次记录 ${seq}：仓库华东一号库，温控区域 A-${index % 7}，` +
    `承运商编号 SF-${1000 + index}，交接人张工/李工轮换，备注含一串用于占体积的确定性文本 ` +
    `x${'q7m2'.repeat(30)}`;
  return {
    id: index === 0 ? ANCHOR_ID : `ITEM-${seq}`,
    code: `ORD-${seq}`,
    status: index % 3 === 0 ? 'pending' : 'done',
    score: (index % 50) / 10,
    payload,
  };
}

const TOOLS = [
  {
    name: 'big_json',
    description: '返回大量结构化订单记录（eval 压缩评估专用）',
    inputSchema: {
      type: 'object',
      properties: { count: { type: 'number', description: '记录条数，默认 600' } },
    },
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
  if (message.id === undefined || message.id === null) return;

  switch (message.method) {
    case 'initialize':
      reply(message.id, {
        protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'eval-big-output', version: '1.0.0' },
      });
      initialized = true;
      break;
    case 'tools/list':
      reply(message.id, { tools: TOOLS });
      break;
    case 'tools/call': {
      const name = message.params?.name;
      if (name !== 'big_json') {
        reply(message.id, { content: [{ type: 'text', text: `未知工具 ${name}` }], isError: true });
        break;
      }
      const count = Number(message.params?.arguments?.count ?? 600) || 600;
      const items = Array.from({ length: count }, (_, i) => makeItem(i));
      reply(message.id, {
        content: [{ type: 'text', text: JSON.stringify(items) }],
        isError: false,
      });
      break;
    }
    case 'ping':
      reply(message.id, {});
      break;
    default:
      send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `方法 ${message.method} 不存在` } });
  }
});
