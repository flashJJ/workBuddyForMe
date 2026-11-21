#!/usr/bin/env node
/**
 * v4.11 P2-1：会话 trace → 可回放的 mock 场景。
 *
 * 读取一段真实对话的工具轨迹（messages.tool_trace），还原成场景脚本：
 *   - 工具参数：fetch_webpage 的 argsSummary 就是 URL；web_search/knowledge_search 是 query；
 *     其余工具尝试 JSON.parse(argsSummary)。摘要被裁剪时直接失败，不生成半成品。
 *   - 轮次：按 startedAt 聚类，50ms 内开始的调用视为同一模型轮次的并发批。
 *   - 预期：工具顺序 / 失败工具 / 探针条数 / 启用工具，供 `run.mjs --replay` 直接断言。
 *
 * 用法：
 *   node scripts/acceptance/trace-to-scenario.mjs --base-url=http://127.0.0.1:32341 \
 *     --conversation-id=<id> [--message-id=<id>] [--name=trace-xxx] \
 *     [--out=tests/scenarios/trace-replay.json] [--tier=128k] [--print]
 *   node scripts/acceptance/trace-to-scenario.mjs --input=messages.json --name=... [--print]
 *
 * 输入 JSON 可以是 messages 数组，或 { messages: [...] }（与接口返回同形）。
 * 仅支持只读工具：非 read 工具的 trace 需要人工确认，离线回放无法自动完成。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from '../eval/lib/http.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DEFAULT_OUT = join(ROOT, 'tests', 'scenarios', 'trace-replay.json');
/** 同一模型轮次内的并发调用开始时间非常接近；串行调用至少间隔上一调用耗时 */
const PARALLEL_WINDOW_MS = 50;
const LOOPBACK_RE = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/i;
const NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

function readArgs(argv) {
  const args = {
    baseUrl: '',
    conversationId: '',
    messageId: '',
    input: '',
    name: '',
    out: '',
    tier: '128k',
    print: false,
    help: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg === '--print') args.print = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice('--base-url='.length);
    else if (arg.startsWith('--conversation-id=')) args.conversationId = arg.slice('--conversation-id='.length);
    else if (arg.startsWith('--message-id=')) args.messageId = arg.slice('--message-id='.length);
    else if (arg.startsWith('--input=')) args.input = arg.slice('--input='.length);
    else if (arg.startsWith('--name=')) args.name = arg.slice('--name='.length);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg.startsWith('--tier=')) args.tier = arg.slice('--tier='.length);
    else throw new Error(`未知参数：${arg}`);
  }
  return args;
}

function usage() {
  console.log(`用法：
  node scripts/acceptance/trace-to-scenario.mjs --base-url=<url> --conversation-id=<id> [--message-id=<id>]
  node scripts/acceptance/trace-to-scenario.mjs --input=<messages.json>
  可选：--name=<场景名> --out=<输出文件> --tier=8k|128k|1m --print`);
}

function resolvePath(path) {
  return isAbsolute(path) ? path : join(ROOT, path);
}

function displayPath(path) {
  return relative(ROOT, path).split(sep).join('/');
}

function textOf(message) {
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n');
  }
  return '';
}

/** 本地夹具地址统一回写成 {{FIXTURE}}，生成物可直接被验收栈执行 */
function rewriteUrl(url) {
  return LOOPBACK_RE.test(url) ? url.replace(LOOPBACK_RE, '{{FIXTURE}}') : url;
}

function rewriteDeep(value) {
  if (typeof value === 'string') return rewriteUrl(value);
  if (Array.isArray(value)) return value.map(rewriteDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteDeep(item)]));
  }
  return value;
}

function clipped(summary) {
  return summary.endsWith('…');
}

function parseJsonSummary(summary, tool) {
  if (clipped(summary)) throw new Error(`${tool} 的参数摘要被裁剪，无法还原完整参数：${summary}`);
  try {
    return JSON.parse(summary);
  } catch {
    throw new Error(`${tool} 的参数摘要不是 JSON：${summary}`);
  }
}

/** trace 条目 → 场景 toolCall；无法可靠还原参数时抛出可行动的错误 */
function toToolCall(entry) {
  const name = String(entry.tool ?? '').trim();
  if (!name) throw new Error('trace 条目缺少工具名');
  const summary = String(entry.argsSummary ?? '').trim();
  if (name === 'current_time') return { name, args: {} };
  if (!summary) throw new Error(`${name} 缺少参数摘要`);
  if (name === 'fetch_webpage') {
    if (clipped(summary)) throw new Error(`fetch_webpage 的 URL 摘要被裁剪，请手工补全：${summary}`);
    return { name, args: { url: rewriteUrl(summary) } };
  }
  if (name === 'web_search' || name === 'knowledge_search') {
    if (clipped(summary)) throw new Error(`${name} 的 query 摘要被裁剪，请手工补全：${summary}`);
    return { name, args: { query: summary } };
  }
  return { name, args: rewriteDeep(parseJsonSummary(summary, name)) };
}

/**
 * 按开始时间聚类成模型轮次，末尾追加一回合话用于展开 {{toolState}} 探针。
 * @param {Array<{tool:string, argsSummary?:string, startedAt?:string}>} trace
 */
function buildTurns(trace) {
  const turns = [];
  let batchStart = null;
  for (const entry of trace) {
    const start = Date.parse(entry.startedAt ?? '');
    const sameBatch =
      turns.length > 0 &&
      Number.isFinite(start) &&
      Number.isFinite(batchStart) &&
      start - batchStart <= PARALLEL_WINDOW_MS;
    if (!sameBatch) {
      turns.push({ toolCalls: [] });
      batchStart = start;
    }
    turns.at(-1).toolCalls.push(toToolCall(entry));
  }
  turns.push({ content: '（trace 回放）观测：{{toolState}}' });
  return turns;
}

/** 定位目标 assistant 消息：显式 id 优先，否则取最后一条带工具轨迹的消息 */
function targetIndex(messages, messageId) {
  if (messageId) {
    const index = messages.findIndex((item) => item.id === messageId);
    if (index === -1) throw new Error(`消息不存在：${messageId}`);
    return index;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'assistant' && message.toolTrace?.length) return index;
  }
  throw new Error('未找到带工具轨迹的 assistant 消息');
}

function lastUserText(messages, stopIndex) {
  for (let index = stopIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'user') continue;
    return textOf(message).replace(/\[scenario:[^\]]*\]/g, '').trim();
  }
  return '';
}

async function loadMessages(args) {
  if (args.input) {
    const raw = JSON.parse(readFileSync(resolvePath(args.input), 'utf-8'));
    const messages = Array.isArray(raw) ? raw : raw?.messages;
    if (!Array.isArray(messages)) throw new Error('输入文件既不是 messages 数组，也不是 { messages }');
    return messages;
  }
  const baseUrl = args.baseUrl.replace(/\/+$/, '');
  return api(baseUrl, `/api/conversations/${args.conversationId}/messages`);
}

/** 写回放文件：保留已有场景，同名场景覆盖 */
function writeScenario(outPath, name, scenario) {
  const file = existsSync(outPath)
    ? JSON.parse(readFileSync(outPath, 'utf-8'))
    : { triggerPrefix: '[scenario:', scenarios: {} };
  file.triggerPrefix ??= '[scenario:';
  file.scenarios ??= {};
  const overwritten = Boolean(file.scenarios[name]);
  file.scenarios[name] = scenario;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(file, null, 2)}\n`, 'utf-8');
  return overwritten;
}

async function main() {
  const args = readArgs(process.argv);
  if (args.help) {
    usage();
    return;
  }
  if (!args.input && (!args.baseUrl || !args.conversationId)) {
    throw new Error('需要 --input=<messages.json>，或同时提供 --base-url 与 --conversation-id');
  }
  if (!['8k', '128k', '1m'].includes(args.tier)) {
    throw new Error(`--tier 只支持 8k / 128k / 1m，收到：${args.tier}`);
  }

  const messages = await loadMessages(args);
  const index = targetIndex(messages, args.messageId);
  const target = messages[index];
  const trace = target.toolTrace ?? [];
  if (trace.length === 0) throw new Error('目标消息没有工具轨迹');

  const risky = trace.filter((entry) => entry.permission && entry.permission !== 'read');
  if (risky.length > 0) {
    throw new Error(
      `trace 含 ${risky.length} 个非只读工具（${[...new Set(risky.map((entry) => entry.tool))].join(
        '、',
      )}），离线回放无法完成人工确认；请为这些工具配置 allow 授权后重跑，或改用手工场景`,
    );
  }

  const turns = buildTurns(trace);
  const failed = trace.filter((entry) => entry.status !== 'ok');
  const name = args.name || `trace-${String(target.id).slice(0, 8)}`;
  if (!NAME_RE.test(name)) throw new Error(`场景名只允许字母/数字/._-：${name}`);

  const scenario = {
    turns,
    replay: {
      message: lastUserText(messages, index) || 'trace 回放',
      tier: args.tier,
      enabledTools: [...new Set(trace.map((entry) => entry.tool))],
      expect: {
        approvals: 0,
        toolOrder: trace.map((entry) => entry.tool),
        failedTools: failed.map((entry) => entry.tool),
        probeCount: trace.length,
      },
    },
  };

  if (args.print) {
    console.log(JSON.stringify({ [name]: scenario }, null, 2));
    return;
  }

  const outPath = args.out ? resolvePath(args.out) : DEFAULT_OUT;
  const overwritten = writeScenario(outPath, name, scenario);
  console.log(`已写入：${displayPath(outPath)}${overwritten ? '（覆盖同名场景）' : ''}`);
  console.log(`场景：${name}（${trace.length} 个工具调用 / ${turns.length - 1} 轮工具脚本）`);
  console.log(`工具顺序：${scenario.replay.expect.toolOrder.join(' → ')}`);
  console.log(`失败工具：${failed.length > 0 ? failed.map((entry) => entry.tool).join('、') : '无'}`);
  console.log(
    `运行：node scripts/acceptance/run.mjs --replay=${displayPath(outPath)} --only=${name}`,
  );
}

main().catch((error) => {
  console.error(`trace→scenario 失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
