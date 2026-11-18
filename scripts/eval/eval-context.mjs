#!/usr/bin/env node
/**
 * v4.8 对话上下文智能调控评测（golden：context-golden.json）。
 *
 * 链路（必须在 WBFM_MOCK_AI=1 的 server 上运行）：
 *   规则意图识别 → 按意图分配块配额（context_snapshot）→ 记住/忘掉 →
 *   用户显式压缩（context_condensed）→ 压缩后原文配额收敛。
 *   小模型分类器默认关闭，因此全部用例走确定性规则路径。
 *
 * 断言（9 条）：
 *   1-4 意图路由：turn_intent.kind 与原文 TAIL 配额（historyBudget/usableWindow）；
 *   5-6 记忆治理：记住后 active 可见、忘掉后 active 不可见；
 *   7   压缩事件：trigger=user_explicit、未降级、折叠 id 恰为最早消息、前后 token 下降；
 *   8   压缩成本：压缩后一轮的 historyTokens < 压缩前 × maxHistoryRatio；
 *   9   预算不变量：system+tools+reserve+history ≤ usableWindow，且 history ≤ historyBudget。
 *
 * 非目标：mock 模型不回放历史语义，跨轮「引用具体数字/URL」留真机验收。
 *
 * 用法：node scripts/eval/eval-context.mjs [--base-url=URL] [--out=PATH]
 * 退出码：断言失败=1；基础设施错误=2；全过=0。
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './lib/http.mjs';
import { streamChat } from './lib/sse-client.mjs';
import { allChecks, outputNotEmpty } from './lib/assertions.mjs';
import { summarize, printSummary, writeReport } from './lib/report.mjs';
import { ensureMockStack } from './lib/mock-seed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, 'context-golden.json');

/** 评测用最小助手配置：只保留长期记忆，其余段落下线，保证原文配额成为事实上限 */
const EVAL_ASSISTANT_PATCH = {
  memoryEnabled: true,
  cardId: null,
  enabledTools: [],
  skillNames: ['__eval_context_none__'],
  expressionEnabled: false,
};

function parseArgs(argv) {
  const args = { baseUrl: process.env.WBFM_BASE_URL ?? 'http://127.0.0.1:3200', out: null };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice('--base-url='.length);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
  }
  return args;
}

async function readTimeline(baseUrl, conversationId) {
  return api(
    baseUrl,
    `/api/events?scope=chat&scopeId=${encodeURIComponent(conversationId)}&limit=500`,
  );
}

/** 按写入顺序取最新同类事件（timeline 为 seq 升序） */
function latestEvent(events, type) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].type === type) return events[i];
  }
  return null;
}

function contextSnapshots(events) {
  return events.filter((event) => event.type === 'context_snapshot');
}

async function createConversation(baseUrl, assistantId, title) {
  return api(baseUrl, '/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ assistantId, title }),
  });
}

async function chat(baseUrl, assistantId, conversationId, content) {
  const result = await streamChat(baseUrl, '/api/chat/stream', {
    assistantId,
    conversationId,
    content,
  });
  if (result.error) throw new Error(`对话失败：${result.error}`);
  return result;
}

/** 意图 → 原文块配额（TAIL）断言：historyBudget / usableWindow ≈ 期望占比 */
export function quotaCheck(snapshot, expectTail, tolerance) {
  const payload = snapshot?.payload;
  if (
    !payload ||
    typeof payload.historyBudget !== 'number' ||
    typeof payload.usableWindow !== 'number' ||
    payload.usableWindow <= 0
  ) {
    return { pass: false, reason: '缺少 context_snapshot 的 historyBudget/usableWindow' };
  }
  const ratio = payload.historyBudget / payload.usableWindow;
  const pass = Math.abs(ratio - expectTail) <= tolerance;
  return {
    pass,
    reason: `原文配额 ${(ratio * 100).toFixed(1)}%（期望 ${(expectTail * 100).toFixed(0)}% ± ${(
      tolerance * 100
    ).toFixed(0)}%，historyBudget=${payload.historyBudget}/usableWindow=${payload.usableWindow}）`,
  };
}

/** 预算不变量：各块之和不得超可用窗口，历史装载不得超过配额或丢空 */
export function budgetInvariant(snapshot) {
  const payload = snapshot?.payload;
  if (!payload || typeof payload.usableWindow !== 'number') {
    return { pass: false, reason: '缺少 context_snapshot 预算字段' };
  }
  const used =
    (payload.systemTokens ?? 0) +
    (payload.toolsTokens ?? 0) +
    (payload.reserveTokens ?? 0) +
    (payload.historyTokens ?? 0);
  const withinWindow = used <= payload.usableWindow + 1;
  const withinQuota = (payload.historyTokens ?? 0) <= (payload.historyBudget ?? 0);
  const hasHistory = (payload.keptMessages ?? 0) >= 1;
  const pass = withinWindow && withinQuota && hasHistory;
  return {
    pass,
    reason: pass
      ? `块合计 ${used} ≤ 窗口 ${payload.usableWindow}`
      : `块合计 ${used}/${payload.usableWindow}，history ${payload.historyTokens}/${payload.historyBudget}，kept=${payload.keptMessages}`,
  };
}

function toResult(id, check) {
  const reasons = check.reasons ?? [];
  return {
    id,
    pass: check.pass,
    reason: reasons.length > 0 ? reasons[reasons.length - 1].reason : check.reason ?? '',
    failedReasons: check.failedReasons ?? [],
  };
}

async function runIntentCases(baseUrl, assistantId, golden, snapshots) {
  const results = [];
  for (const testCase of golden.intentCases) {
    const conversation = await createConversation(baseUrl, assistantId, `eval-context-${testCase.id}`);
    const turn = await chat(baseUrl, assistantId, conversation.id, testCase.text);
    const timeline = await readTimeline(baseUrl, conversation.id);
    snapshots.push(...contextSnapshots(timeline.events));
    const intent = latestEvent(timeline.events, 'turn_intent');
    const kind = intent?.payload?.kind;
    const check = allChecks([
      outputNotEmpty(turn.content),
      {
        pass: kind === testCase.expectKind,
        reason: `意图 ${kind ?? '缺失'}（期望 ${testCase.expectKind}）`,
      },
      quotaCheck(
        latestEvent(timeline.events, 'context_snapshot'),
        testCase.expectTail,
        golden.quotaTolerance,
      ),
    ]);
    results.push(toResult(testCase.id, check));
  }
  return results;
}

async function runMemoryCases(baseUrl, assistantId, golden) {
  const conversation = await createConversation(baseUrl, assistantId, 'eval-context-memory');
  const activeHits = async () => {
    const list = await api(
      baseUrl,
      `/api/memories?search=${encodeURIComponent(golden.memoryKeyword)}&status=active&limit=50`,
    );
    return list.filter((memory) => String(memory.content ?? '').includes(golden.memoryKeyword));
  };

  const results = [];
  for (const testCase of golden.memoryCases) {
    await chat(baseUrl, assistantId, conversation.id, testCase.text);
    const timeline = await readTimeline(baseUrl, conversation.id);
    const intent = latestEvent(timeline.events, 'turn_intent');
    const hits = await activeHits();
    const present = hits.length > 0;
    const memoryOk = testCase.expectMemory === 'present' ? present : !present;
    const check = allChecks([
      {
        pass: intent?.payload?.kind === testCase.expectKind,
        reason: `意图 ${intent?.payload?.kind ?? '缺失'}（期望 ${testCase.expectKind}）`,
      },
      {
        pass: memoryOk,
        reason: `「${golden.memoryKeyword}」活跃记忆 ${hits.length} 条（期望${
          testCase.expectMemory === 'present' ? '存在' : '归档'
        }）`,
      },
    ]);
    results.push(toResult(testCase.id, check));
  }
  return results;
}

async function runCompactionCases(baseUrl, assistantId, golden, snapshots) {
  const conversation = await createConversation(baseUrl, assistantId, 'eval-context-compaction');
  for (const text of golden.longTurns) {
    await chat(baseUrl, assistantId, conversation.id, text);
  }
  const beforeTimeline = await readTimeline(baseUrl, conversation.id);
  const beforeSnapshot = latestEvent(beforeTimeline.events, 'context_snapshot');
  snapshots.push(...contextSnapshots(beforeTimeline.events));

  const compact = await api(baseUrl, `/api/conversations/${conversation.id}/compact`, {
    method: 'POST',
  });
  const messages = await api(baseUrl, `/api/conversations/${conversation.id}/messages`);
  const afterCompactTimeline = await readTimeline(baseUrl, conversation.id);
  const condensed = latestEvent(afterCompactTimeline.events, 'context_condensed');
  const payload = condensed?.payload ?? {};
  const folded = Array.isArray(payload.foldedMessageIds) ? payload.foldedMessageIds : [];
  const orderedIds = [...messages]
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map((message) => message.id);
  const foldedIsOldest =
    folded.length > 0 && folded.every((id, index) => id === orderedIds[index]);

  const eventCheck = allChecks([
    {
      pass: compact.compactedTurns >= golden.compaction.minFolded,
      reason: `折叠 ${compact.compactedTurns} 条（要求 ≥${golden.compaction.minFolded}）`,
    },
    {
      pass: typeof compact.summary === 'string' && compact.summary.trim().length > 0,
      reason: compact.summary ? '摘要非空' : '摘要为空',
    },
    {
      pass: payload.trigger === 'user_explicit',
      reason: `触发原因 ${payload.trigger ?? '缺失'}（期望 user_explicit）`,
    },
    {
      pass: payload.degraded === false,
      reason: payload.degraded === false ? '压缩未降级' : '压缩降级或缺失',
    },
    {
      pass: folded.length === compact.compactedTurns,
      reason: `事件折叠 ${folded.length} 条 vs 返回 ${compact.compactedTurns} 条`,
    },
    {
      pass: foldedIsOldest,
      reason: foldedIsOldest
        ? '折叠 id 为最早消息（原文可按 id 读回）'
        : `折叠 id 与最早消息不一致（folded=${folded.join(',')}）`,
    },
    {
      pass: (payload.beforeTokens ?? 0) > (payload.afterTokens ?? 0),
      reason: `压缩前 ${payload.beforeTokens} → 压缩后 ${payload.afterTokens}`,
    },
  ]);

  await chat(baseUrl, assistantId, conversation.id, '继续');
  const afterTimeline = await readTimeline(baseUrl, conversation.id);
  snapshots.push(...contextSnapshots(afterTimeline.events));
  const afterSnapshot = latestEvent(afterTimeline.events, 'context_snapshot');
  const beforeTokens = beforeSnapshot?.payload?.historyTokens ?? 0;
  const afterTokens = afterSnapshot?.payload?.historyTokens ?? 0;
  const limit = Math.floor(beforeTokens * golden.compaction.maxHistoryRatio);
  const costCheck = {
    pass: beforeTokens > 0 && afterTokens < limit,
    reason: `压缩后 historyTokens ${afterTokens} < ${limit}（压缩前 ${beforeTokens} × ${golden.compaction.maxHistoryRatio}）`,
  };

  return [toResult('compaction-event', eventCheck), toResult('compaction-cost', costCheck)];
}

function runBudgetCase(snapshots) {
  const check = allChecks([
    {
      pass: snapshots.length >= 8,
      reason: `快照 ${snapshots.length} 条（要求 ≥8）`,
    },
    ...snapshots.map(budgetInvariant),
  ]);
  return toResult('budget-invariant', check);
}

async function patchAssistant(baseUrl, assistantId, patch) {
  return api(baseUrl, `/api/assistants/${assistantId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const golden = JSON.parse(await readFile(GOLDEN_PATH, 'utf-8'));
  const stack = await ensureMockStack(args.baseUrl);
  const original = await api(args.baseUrl, `/api/assistants/${stack.assistantId}`);
  // 评测前置：开启长期记忆；临时卸下角色卡/工具/技能/表情指令，
  // 让系统提示与工具清单足够小，原文配额（TAIL）才能成为真正的上限（结束后原样还原）。
  await patchAssistant(args.baseUrl, stack.assistantId, EVAL_ASSISTANT_PATCH);
  console.log(`开始上下文评测：${args.baseUrl}（助手 ${stack.assistantId}，mock 模型）\n`);

  const snapshots = [];
  const results = [];
  try {
    results.push(...(await runIntentCases(args.baseUrl, stack.assistantId, golden, snapshots)));
    results.push(...(await runMemoryCases(args.baseUrl, stack.assistantId, golden)));
    results.push(...(await runCompactionCases(args.baseUrl, stack.assistantId, golden, snapshots)));
    results.push(runBudgetCase(snapshots));
  } finally {
    const restore = {};
    for (const key of Object.keys(EVAL_ASSISTANT_PATCH)) restore[key] = original[key];
    await patchAssistant(args.baseUrl, stack.assistantId, restore).catch(() => undefined);
  }

  const summary = summarize(results, {
    name: 'eval-context',
    meta: { snapshots: snapshots.length, intentEnabled: false },
  });
  const code = printSummary(summary);
  if (args.out) await writeReport(args.out, summary);
  process.exit(code);
}

main().catch((error) => {
  console.error(`\n评估中断：${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
