#!/usr/bin/env node
/**
 * v1.1 M5 主动搭话回归评估（golden：不落库协议 + 失败静默）。
 *
 * 针对 /api/chat/proactive（skip-history 轻量轮）的三条不变量：
 *   1. 空闲轻量轮协议：meta 帧 proactive:true 且 messageId 为临时前缀（proactive-）；
 *   2. 不落库：主动轮前后会话消息数严格不变（用户触发指令与助手搭话都不写库）；
 *   3. 失败静默：助手不存在等失败路径返回错误且同样不落库。
 *
 * 前置：Web 服务正在运行（WBFM_MOCK_AI=1 最稳，真模型亦可）。
 * 用法：node scripts/eval/eval-proactive.mjs [--base-url=URL] [--out=PATH]
 * 退出码：断言失败=1；基础设施错误=2；全过=0。
 */
import { writeFile } from 'node:fs/promises';
import { api } from './lib/http.mjs';
import { streamChat, eventsOf } from './lib/sse-client.mjs';
import { eventsContain, messageCountUnchanged, allChecks } from './lib/assertions.mjs';
import { summarize, printSummary, writeReport } from './lib/report.mjs';
import { ensureMockStack } from './lib/mock-seed.mjs';

const PROACTIVE_PREFIX = 'proactive-';

function parseArgs(argv) {
  const args = { baseUrl: process.env.WBFM_BASE_URL ?? 'http://127.0.0.1:3000', out: null };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice('--base-url='.length);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
  }
  return args;
}

async function messageCount(baseUrl, conversationId) {
  const messages = await api(baseUrl, `/api/conversations/${conversationId}/messages`);
  return messages.length;
}

async function main() {
  const args = parseArgs(process.argv);
  const cases = [];

  // 幂等准备 mock 供应商/模型/默认设置（要求 server 以 WBFM_MOCK_AI=1 启动）
  const seed = await ensureMockStack(args.baseUrl);
  const assistant = { id: seed.assistantId };

  // 前置：经正常对话写 2 条消息（一问一答），建立基线消息数
  const conversation = await api(args.baseUrl, '/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ assistantId: assistant.id, title: 'eval-proactive' }),
  });
  const warmup = await streamChat(
    args.baseUrl,
    '/api/chat/stream',
    { assistantId: assistant.id, conversationId: conversation.id, content: 'eval 前置消息：你好' },
  );
  if (warmup.error) throw new Error(`前置对话失败：${warmup.error}`);

  const before = await messageCount(args.baseUrl, conversation.id);

  // 用例 1+2：主动轮协议标记 + 不落库
  const pro = await streamChat(args.baseUrl, '/api/chat/proactive', {
    assistantId: assistant.id,
    conversationId: conversation.id,
  });
  const metas = eventsOf(pro.events, 'meta');
  const meta = metas[0];
  const after = await messageCount(args.baseUrl, conversation.id);

  const normalChecks = allChecks([
    eventsContain(pro.events, 'meta'),
    eventsContain(pro.events, 'done'),
    {
      pass: meta?.proactive === true,
      reason: meta?.proactive === true ? 'meta.proactive=true' : 'meta 未带 proactive:true',
    },
    {
      pass: typeof meta?.messageId === 'string' && meta.messageId.startsWith(PROACTIVE_PREFIX),
      reason:
        typeof meta?.messageId === 'string' && meta.messageId.startsWith(PROACTIVE_PREFIX)
          ? `临时消息 id（${PROACTIVE_PREFIX}…）`
          : `messageId 非临时前缀：${meta?.messageId}`,
    },
    {
      pass: !pro.error,
      reason: pro.error ? `主动轮流错误：${pro.error}` : '主动流正常收尾',
    },
    // 主动轮必须产生搭话内容（模型输出或 empty fallback），防止空流假成功
    {
      pass: pro.content.trim().length > 0,
      reason: pro.content.trim() ? `搭话内容 ${pro.content.length} 字` : '搭话内容为空且无兜底',
    },
    messageCountUnchanged(before, after),
  ]);
  cases.push({
    id: 'proactive-protocol-and-no-persist',
    pass: normalChecks.pass,
    failedReasons: normalChecks.failedReasons,
    meta: { before, after, contentPreview: pro.content.slice(0, 40) },
  });

  // 用例 3：失败静默——不存在的助手应被拒绝，且不产生任何写入（会话消息数仍不变）
  let failureRejected = false;
  let failureReason = '未发起请求';
  try {
    await streamChat(args.baseUrl, '/api/chat/proactive', {
      assistantId: 'eval-nonexistent-assistant-id',
      conversationId: conversation.id,
    });
    // SSE error 帧也是一种被拒绝形态（不抛异常但带 error）
    failureReason = '请求返回但未见错误';
  } catch (error) {
    failureRejected = true;
    failureReason = String(error instanceof Error ? error.message : error);
  }
  const afterFailure = await messageCount(args.baseUrl, conversation.id);
  const failChecks = allChecks([
    {
      pass: failureRejected,
      reason: failureRejected ? `失败路径被拒绝（${failureReason.slice(0, 60)}）` : failureReason,
    },
    messageCountUnchanged(after, afterFailure),
  ]);
  cases.push({
    id: 'proactive-failure-silent',
    pass: failChecks.pass,
    failedReasons: failChecks.failedReasons,
  });

  const summary = summarize(cases, {
    name: 'eval-proactive',
    meta: { baseUrl: args.baseUrl, assistant: assistant.id, conversation: conversation.id },
  });
  const code = printSummary(summary);
  if (args.out) await writeReport(args.out, summary);
  process.exit(code);
}

main().catch((error) => {
  console.error(`\n评估中断：${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
