#!/usr/bin/env node
/**
 * v1.1 M5 工具结果中央压缩端到端评估（golden：tool-compact-golden.json）。
 *
 * 链路（必须在 WBFM_MOCK_AI=1 的 server 上运行）：
 *   注册 big-output MCP fixture（stdio）→ 助手授权该工具 → mock AI 以
 *   [eval-tool:mcp:eval-big:big_json] 触发调用 → 拉回 ~120KB JSON →
 *   core 中央压缩层把入模视图压到窗口预算内 → mock 二次引用压缩视图中的
 *   首条 id 与 __omitted 标记作答。
 *
 * 断言（成功指标对账）：
 *   1. 工具真实执行（tool start/end，status=ok）；
 *   2. 压缩生效：done.usage.promptTokens ≤ golden.promptTokenBudget（未压缩 120KB≈30k）；
 *   3. 二次引用成功：回答含首条身份 id（anchorId）且读到 __omitted 标记；
 *   4. trace 可查：落库 tool_trace 有条目 compacted=true 且 originalTokens > modelTokens。
 *
 * 用法：node scripts/eval/eval-tool-compact.mjs [--base-url=URL] [--out=PATH] [--keep]
 * 退出码：断言失败=1；基础设施错误=2；全过=0。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { api } from './lib/http.mjs';
import { streamChat, eventsOf } from './lib/sse-client.mjs';
import {
  eventsContain,
  outputContainsAny,
  promptTokensBelow,
  allChecks,
} from './lib/assertions.mjs';
import { summarize, printSummary, writeReport } from './lib/report.mjs';
import { ensureMockStack } from './lib/mock-seed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, 'tool-compact-golden.json');

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.WBFM_BASE_URL ?? 'http://127.0.0.1:3200',
    out: null,
    keep: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice('--base-url='.length);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--keep') args.keep = true;
  }
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollUntil(fn, { timeout = 30_000, interval = 1_000, desc } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  for (;;) {
    last = await fn();
    if (last) return last;
    if (Date.now() > deadline) throw new Error(`等待超时：${desc ?? '条件'}`);
    await sleep(interval);
  }
}

async function ensureMcpServer(baseUrl, golden) {
  const existing = await api(baseUrl, '/api/mcp/servers');
  const old = existing.find((s) => s.name === golden.mcpServerName);
  if (old) await api(baseUrl, `/api/mcp/servers/${old.id}`, { method: 'DELETE' });

  // Windows 下直接用 node 启动 fixture（eval 跑在开发机，node 在 PATH）
  const created = await api(baseUrl, '/api/mcp/servers', {
    method: 'POST',
    body: JSON.stringify({
      name: golden.mcpServerName,
      transport: 'stdio',
      command: 'node',
      args: [join(HERE, golden.fixture)],
    }),
  });

  // 轮询连接成功且工具已登记
  const ready = await pollUntil(
    async () => {
      const infos = await api(baseUrl, '/api/mcp/servers');
      const info = infos.find((s) => s.id === created.id);
      // server info 只暴露 toolCount（工具明细经工具运行时按 mcp:<server>:<tool> 解析）
      if (info?.status === 'connected' && (info.toolCount ?? 0) >= 1) return info;
      return null;
    },
    { desc: 'MCP big-output 连接并登记工具', timeout: 30_000 },
  );
  return created.id;
}

async function authorizeTool(baseUrl, assistantId, toolCallName) {
  const assistant = await api(baseUrl, `/api/assistants/${assistantId}`);
  const enabledTools = Array.from(new Set([...(assistant.enabledTools ?? []), toolCallName]));
  await api(baseUrl, `/api/assistants/${assistantId}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabledTools }),
  });
  return assistant.enabledTools ?? [];
}

async function main() {
  const args = parseArgs(process.argv);
  const golden = JSON.parse(await readFile(GOLDEN_PATH, 'utf-8'));
  const meta = { baseUrl: args.baseUrl };
  const checks = [];

  // 幂等准备 mock 供应商/模型/默认设置（要求 server 以 WBFM_MOCK_AI=1 启动）
  const seed = await ensureMockStack(args.baseUrl);

  const mcpId = await ensureMcpServer(args.baseUrl, golden);
  const originalTools = await authorizeTool(args.baseUrl, seed.assistantId, golden.toolCallName);

  try {
    const conversation = await api(args.baseUrl, '/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ assistantId: seed.assistantId, title: 'eval-tool-compact' }),
    });

    const stream = await streamChat(args.baseUrl, '/api/chat/stream', {
      assistantId: seed.assistantId,
      conversationId: conversation.id,
      content: golden.trigger,
    });
    meta.hadStreamError = Boolean(stream.error);

    const toolStarts = eventsOf(stream.events, 'tool').filter((d) => d.phase === 'start');
    const toolEnds = eventsOf(stream.events, 'tool').filter((d) => d.phase === 'end');
    const toolEnd = toolEnds.find((d) => d.tool === golden.toolCallName);

    // 断言 1：工具真实执行
    checks.push(
      allChecks([
        eventsContain(stream.events, 'tool'),
        {
          pass: toolStarts.some((d) => d.tool === golden.toolCallName),
          reason: toolStarts.some((d) => d.tool === golden.toolCallName)
            ? `${golden.toolCallName} 已启动`
            : `未见 ${golden.toolCallName} start（实际：${toolStarts.map((d) => d.tool).join(',') || '无'}）`,
        },
        {
          pass: toolEnd?.status === 'ok',
          reason: toolEnd ? `工具结束 status=${toolEnd.status}` : '未见工具 end 事件',
        },
      ]),
    );

    // 断言 2：压缩生效（token 预算）
    const promptTokens = stream.usage?.promptTokens;
    meta.promptTokens = promptTokens;
    meta.promptTokenBudget = golden.promptTokenBudget;
    checks.push(
      allChecks([
        {
          pass: typeof promptTokens === 'number',
          reason: typeof promptTokens === 'number' ? `done.usage.promptTokens=${promptTokens}` : 'done 帧无 usage.promptTokens',
        },
        promptTokensBelow(promptTokens ?? Number.POSITIVE_INFINITY, golden.promptTokenBudget),
      ]),
    );

    // 断言 3：二次引用（身份 id 保留 + __omitted 标记可见）
    const anchor = outputContainsAny(stream.content, [golden.anchorId]);
    const omittedVisible = /omitted=\d+/.test(stream.content) && !/omitted=0\b/.test(stream.content);
    checks.push(
      allChecks([
        anchor,
        {
          pass: omittedVisible,
          reason: omittedVisible
            ? stream.content.match(/omitted=\d+/)?.[0]
            : '回答未引用非零 __omitted（压缩视图的省略标记不可见）',
        },
      ]),
    );

    // 断言 4：trace 压缩元数据落库
    const messages = await api(args.baseUrl, `/api/conversations/${conversation.id}/messages`);
    const traces = messages.flatMap((m) => m.toolTrace ?? m.tool_trace ?? []);
    const compactTrace = traces.find(
      (t) => t.tool === golden.toolCallName && t.compacted === true,
    );
    meta.traceCompaction = compactTrace
      ? { originalTokens: compactTrace.originalTokens, modelTokens: compactTrace.modelTokens }
      : null;
    checks.push(
      allChecks([
        {
          pass: Boolean(compactTrace),
          reason: compactTrace
            ? 'tool_trace 记录 compacted=true'
            : `tool_trace 无压缩记录（全部 trace：${traces.map((t) => `${t.tool}:${t.compacted ?? false}`).join(',') || '无'}）`,
        },
        {
          pass:
            Boolean(compactTrace) &&
            typeof compactTrace.originalTokens === 'number' &&
            typeof compactTrace.modelTokens === 'number' &&
            compactTrace.originalTokens > compactTrace.modelTokens,
          reason: compactTrace
            ? `originalTokens=${compactTrace.originalTokens} > modelTokens=${compactTrace.modelTokens}`
            : '无压缩 trace 可比',
        },
      ]),
    );
  } finally {
    // 还原助手授权；默认清理 eval MCP（--keep 保留便于排查）
    await api(args.baseUrl, `/api/assistants/${seed.assistantId}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabledTools: originalTools }),
    }).catch(() => undefined);
    if (!args.keep) {
      await api(args.baseUrl, `/api/mcp/servers/${mcpId}`, { method: 'DELETE' }).catch(() => undefined);
    }
  }

  const cases = checks.map((c, i) => ({
    id: ['tool-executed', 'compaction-token-budget', 'second-tool-reference', 'trace-dual-view'][i],
    pass: c.pass,
    failedReasons: c.failedReasons,
  }));
  const summary = summarize(cases, { name: 'eval-tool-compact', meta });
  const code = printSummary(summary);
  if (args.out) await writeReport(args.out, summary);
  process.exit(code);
}

main().catch((error) => {
  console.error(`\n评估中断：${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
