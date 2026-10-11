#!/usr/bin/env node
/**
 * v1.4 M2 协作通道手工冒烟脚本（不计 CI 门禁）。
 *
 * 用途：对已启动的本地 workBuddy web 服务发一次真实协作运行，
 * 端到端验证 三级模型回落 + Planner/Executor/Reviewer 真模型通道：
 *   1. POST /api/agent/runs 建行；
 *   2. GET  /api/agent/runs/:id/events 订阅 SSE，收 agent_* 帧到 done/error；
 *   3. 打印阶段/交接/裁决/预算与最终交付；error 帧以非零码退出。
 *
 * 前置：
 *   - pnpm --filter @wbfm/web dev（默认 BASE_URL=http://127.0.0.1:3000）
 *   - 设置中已配置可用对话模型；助手可配置 plannerModelId/executorModelId/reviewerModelId
 *   - 知识型冒烟：助手绑定已编译知识库（executor 走 tool 模式 + knowledge_search）
 *   - 桌面型冒烟：子任务含桌面操作时 executor 模型必须具备视觉能力
 *
 * 用法（PowerShell）：
 *   $env:ASSISTANT_ID="<assistants 表 id>"
 *   $env:GOAL="查一下员工年假有多少天，给出制度依据"
 *   node scripts/eval/agent-smoke.mjs
 *
 * 可选：BASE_URL / MAX_ROUNDS / MAX_STEPS / MAX_TOTAL_TOKENS
 * 退出码：0=done 或 budget_exceeded（预算触顶属通道正常）；1=error 帧/HTTP 错误/参数缺失。
 */

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const assistantId = process.env.ASSISTANT_ID;
const goal = process.env.GOAL;
const maxRounds = process.env.MAX_ROUNDS ? Number(process.env.MAX_ROUNDS) : undefined;
const maxSteps = process.env.MAX_STEPS ? Number(process.env.MAX_STEPS) : undefined;
const maxTotalTokens = process.env.MAX_TOTAL_TOKENS ? Number(process.env.MAX_TOTAL_TOKENS) : undefined;

if (!assistantId || !goal) {
  console.error('缺少环境变量 ASSISTANT_ID / GOAL（见文件头用法说明）');
  process.exit(1);
}

async function postRun() {
  const budget = {
    ...(maxRounds ? { maxRounds } : {}),
    ...(maxSteps ? { maxSteps } : {}),
    ...(maxTotalTokens ? { maxTotalTokens } : {}),
  };
  const resp = await fetch(`${baseUrl}/api/agent/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ assistantId, goal, ...(Object.keys(budget).length ? { budget } : {}) }),
  });
  const payload = await resp.json();
  if (!resp.ok || !payload.success) {
    throw new Error(`POST /api/agent/runs 失败 ${resp.status}: ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

function parseSse(raw) {
  const event = raw.match(/^event: (.+)$/m)?.[1]?.trim();
  const dataLine = raw.match(/^data: (.+)$/m)?.[1];
  if (!event || !dataLine) return null;
  return { event, data: JSON.parse(dataLine) };
}

async function streamEvents(runId) {
  const resp = await fetch(`${baseUrl}/api/agent/runs/${runId}/events`, {
    headers: { accept: 'text/event-stream' },
  });
  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => '');
    throw new Error(`GET events 失败 ${resp.status}: ${text}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  const frames = [];
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = parseSse(buffer.slice(0, sep));
      if (frame) frames.push(frame);
      buffer = buffer.slice(sep + 2);
    }
  }
  if (buffer.trim()) {
    const frame = parseSse(buffer);
    if (frame) frames.push(frame);
  }
  return frames;
}

function summarize(frames) {
  const phases = frames.filter((f) => f.event === 'agent_phase').map((f) => f.data);
  const handoffs = frames.filter((f) => f.event === 'agent_handoff').map((f) => f.data.handoff);
  const reviews = frames.filter((f) => f.event === 'agent_review').map((f) => f.data.review);
  const budgets = frames.filter((f) => f.event === 'agent_budget');
  const done = frames.find((f) => f.event === 'done');
  const error = frames.find((f) => f.event === 'error');
  return { phases, handoffs, reviews, lastBudget: budgets.at(-1)?.data ?? null, done, error };
}

async function main() {
  console.log(`▶ 冒烟目标：${goal}\n  服务：${baseUrl} 助手：${assistantId}`);
  const run = await postRun();
  console.log(`▶ 已建行 ${run.id}（预算 ${JSON.stringify(run.budget)}），订阅事件流…`);
  const frames = await streamEvents(run.id);
  const { phases, handoffs, reviews, lastBudget, done, error } = summarize(frames);

  for (const p of phases) {
    console.log(`  · [${p.round}] ${p.role ?? '-'}:${p.phase}`);
  }
  for (const h of handoffs) {
    const detail = h.payload.subtask
      ? `子任务「${h.payload.subtask.title}」${h.payload.subtask.toolScopes ? ` 域=[${h.payload.subtask.toolScopes}]` : ''}`
      : h.payload.verdict
        ? `裁决 ${h.payload.verdict}${h.payload.reviewNotes ? `：${h.payload.reviewNotes}` : ''}`
        : h.payload.outcome
          ? `交付：${h.payload.outcome.summary.slice(0, 80)}`
          : '';
    console.log(`  ⇄ ${h.fromRole}→${h.toRole} #${h.roundNo}.${h.seq} ${detail}`);
  }
  for (const r of reviews) {
    const passed = r.acceptanceResults.filter((x) => x.passed).length;
    console.log(`  ✓ 第 ${r.round + 1} 轮裁决 ${r.verdict}（${passed}/${r.acceptanceResults.length} 条达标）`);
  }
  if (lastBudget) {
    console.log(`  预算：round=${lastBudget.round} steps=${lastBudget.steps} tokens=${lastBudget.usedTokens}/${lastBudget.totalTokens}`);
  }
  if (done) {
    console.log(`■ done：${done.data.content || '（无总结文本）'}`);
    console.log(`  用量：${JSON.stringify(done.data.usage)}`);
  }
  if (error) {
    console.error(`✗ error：${JSON.stringify(error.data)}`);
    process.exit(1);
  }
  if (!done) {
    console.error('✗ 流结束但未收到 done 帧');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('✗ 冒烟失败：', error instanceof Error ? error.message : error);
  process.exit(1);
});
