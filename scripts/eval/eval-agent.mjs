#!/usr/bin/env node
/**
 * v1.4 M5 多智能体协作评估（T5.1 golden + T5.2 三开关反向）。
 *
 * 前置：WBFM_MOCK_AI=1 的 server（--base-url，默认 3200）。mock 角色协议
 * （packages/ai/mock-agent-protocol.ts）确定性产出 planner/reviewer/executor JSON，
 * 全程零外网、可门禁化。
 *
 * 用法：
 *   node scripts/eval/eval-agent.mjs [--base-url=URL] [--out=PATH] [--switch=reviewer|knowledge|budget]
 *   正向（无 --switch）：全部用例必须通过（含急停用例）。
 *   反向：
 *     reviewer  —— goal 注入 [__switch:reviewer-off]，审查恒通过；审查拦截题必须失败
 *     knowledge —— 解绑知识库+移除 knowledge_search；知识证据题必须失败
 *     budget    —— POST 预算 maxRounds=1；返工题必须收敛 budget_exceeded
 *   SKIP 语义沿用 v1.3 矩阵：标注不含当前开关的题跳过；无标注护栏题必须仍通过。
 *
 * 退出码：0 全过；1 断言失败；2 基础设施错误。
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './lib/http.mjs';
import { summarize, printSummary, writeReport } from './lib/report.mjs';
import { ensureMockStack } from './lib/mock-seed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, 'agent-golden.json');
const SWITCHES = ['reviewer', 'knowledge', 'budget'];

function readArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    const eq = arg.indexOf('=');
    if (eq > 0) out[arg.slice(0, eq).replace(/^-+/, '')] = arg.slice(eq + 1);
  }
  return out;
}

/** multipart 上传文档 */
async function uploadDocument(baseUrl, kbId, name, content) {
  const form = new FormData();
  form.append('file', new Blob([content], { type: 'text/plain' }), name);
  const response = await fetch(`${baseUrl}/api/knowledge-bases/${kbId}/documents`, {
    method: 'POST',
    body: form,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(`上传 ${name} 失败（HTTP ${response.status}）`);
  return payload.data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitCompileReady(baseUrl, kbId, expectCount, { timeout = 60_000 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const docs = await api(baseUrl, `/api/knowledge-bases/${kbId}/documents`);
    if (docs.length >= expectCount && docs.every((d) => d.compileStatus === 'ready')) return;
    if (docs.some((d) => d.compileStatus === 'failed')) throw new Error('存在编译失败文档');
    if (Date.now() > deadline) throw new Error('等待编译超时');
    await sleep(500);
  }
}

async function seedKnowledgeBase(baseUrl, golden) {
  const kb = await api(baseUrl, '/api/knowledge-bases', {
    method: 'POST',
    body: JSON.stringify({ name: `eval-agent-${Date.now()}` }),
  });
  for (const doc of golden.seedDocuments) {
    await uploadDocument(baseUrl, kb.id, doc.name, doc.content);
  }
  await waitCompileReady(baseUrl, kb.id, golden.seedDocuments.length);
  console.log(`知识库 ${kb.id} 就绪：${golden.seedDocuments.length} 文档全部编译完成`);
  return kb;
}

/** 订阅 agent 事件流（GET SSE），收完或主动取消后关闭；返回收到的帧 */
async function consumeAgentEvents(baseUrl, runId, { cancelAfterFirstEvent = false } = {}) {
  const response = await fetch(`${baseUrl}/api/agent/runs/${runId}/events`);
  if (!response.ok || !response.body) throw new Error(`events 建立失败：HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const frames = [];
  let cancelSent = false;

  const handle = (rawEvent) => {
    const lines = rawEvent.split('\n');
    const eventName = lines.find((l) => l.startsWith('event:'))?.slice(6).trim();
    const dataLine = lines.find((l) => l.startsWith('data:'));
    if (!eventName || !dataLine) return;
    const data = JSON.parse(dataLine.slice(5).trim());
    frames.push({ event: eventName, data });
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      handle(buffer.slice(0, sep));
      buffer = buffer.slice(sep + 2);
      if (cancelAfterFirstEvent && !cancelSent && frames.length > 0) {
        cancelSent = true;
        // 不中断本连接：显式走协作级急停路由，随后继续读到收尾帧
        void api(baseUrl, `/api/agent/runs/${runId}/cancel`, { method: 'POST' }).catch(() => {});
      }
      const last = frames.at(-1);
      if (last?.event === 'done' || last?.event === 'error') {
        await reader.cancel().catch(() => {});
        return frames;
      }
    }
  }
  return frames;
}

/** 对权威终态（run+handoffs）做断言，返回失败原因列表（空=通过） */
function checkExpectations(run, handoffs, expect) {
  const reasons = [];
  const outcome = run.finalOutcome;
  const verdicts = handoffs.map((h) => h.payload.verdict).filter(Boolean);
  const evidenceNames = outcome?.evidence?.map((c) => c.documentName) ?? [];
  const toolCalls = outcome?.toolCalls ?? [];

  if (expect.status && run.status !== expect.status) {
    reasons.push(`终态 ${run.status} ≠ ${expect.status}`);
  }
  if (expect.evidenceDoc && !evidenceNames.includes(expect.evidenceDoc)) {
    reasons.push(`证据未命中 ${expect.evidenceDoc}（实际：${evidenceNames.join('、') || '无'}）`);
  }
  if (expect.toolCalls && JSON.stringify(toolCalls) !== JSON.stringify(expect.toolCalls)) {
    reasons.push(`工具序列 ${JSON.stringify(toolCalls)} ≠ ${JSON.stringify(expect.toolCalls)}`);
  }
  if (expect.toolCallsContains && !toolCalls.includes(expect.toolCallsContains)) {
    reasons.push(`工具序列缺少 ${expect.toolCallsContains}（实际：${toolCalls.join('、') || '无'}）`);
  }
  if (expect.summaryContains && !String(outcome?.summary ?? '').includes(expect.summaryContains)) {
    reasons.push(`结论未包含「${expect.summaryContains}」（实际：${String(outcome?.summary ?? '').slice(0, 80)}）`);
  }
  if (typeof expect.rounds === 'number' && run.roundNo + 1 !== expect.rounds) {
    reasons.push(`轮次 ${run.roundNo + 1} ≠ ${expect.rounds}`);
  }
  if (expect.hasVerdict && !verdicts.includes(expect.hasVerdict)) {
    reasons.push(`交接记录中无 ${expect.hasVerdict} 裁决（实际：${verdicts.join('、') || '无'}）`);
  }
  if (typeof expect.unfinishedMin === 'number' && (outcome?.unfinished?.length ?? 0) < expect.unfinishedMin) {
    reasons.push(`未竟项 ${outcome?.unfinished?.length ?? 0} < ${expect.unfinishedMin}`);
  }
  return reasons;
}

async function runCase(baseUrl, assistantId, testCase, sw) {
  const conversation = await api(baseUrl, '/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ assistantId, title: `eval-agent-${testCase.id}` }),
  });
  let goal = testCase.goal;
  if (sw === 'reviewer') goal = `[__switch:reviewer-off] ${goal}`;
  const body = {
    assistantId,
    conversationId: conversation.id,
    goal,
    ...(sw === 'budget' ? { budget: { maxRounds: 1 } } : {}),
  };
  const run = await api(baseUrl, '/api/agent/runs', { method: 'POST', body: JSON.stringify(body) });
  await consumeAgentEvents(baseUrl, run.id, { cancelAfterFirstEvent: Boolean(testCase.cancelAfterFirstEvent) });
  const detail = await api(baseUrl, `/api/agent/runs/${run.id}`);
  return checkExpectations(detail.run, detail.handoffs, testCase.expect ?? {});
}

async function main() {
  const argv = readArgs(process.argv);
  const args = {
    baseUrl: argv['base-url'] ?? process.env.WBFM_BASE_URL ?? 'http://127.0.0.1:3200',
    out: argv.out ?? '',
    sw: argv.switch ?? 'none',
  };
  if (args.sw !== 'none' && !SWITCHES.includes(args.sw)) {
    console.error(`未知 --switch=${args.sw}（可选 ${SWITCHES.join('|')}）`);
    process.exit(2);
  }
  const golden = JSON.parse(await readFile(GOLDEN_PATH, 'utf-8'));
  const stack = await ensureMockStack(args.baseUrl);

  // 预热 cancel 路由（Next dev 首次命中会动态编译，冷编译可能超过急停用例的 slow 窗口）
  await api(args.baseUrl, '/api/agent/runs/non-existent-warmup/cancel', { method: 'POST' }).catch(
    () => {},
  );

  // 知识开关态：解绑知识库并移除 knowledge_search；其余态绑定知识库+检索工具
  const knowledgeOn = args.sw !== 'knowledge';
  const kb = knowledgeOn ? await seedKnowledgeBase(args.baseUrl, golden) : null;
  await api(args.baseUrl, `/api/assistants/${stack.assistantId}`, {
    method: 'PATCH',
    body: JSON.stringify(
      knowledgeOn
        ? {
            knowledgeBaseIds: [kb.id],
            enabledTools: ['current_time', 'knowledge_search'],
            retrieveAlways: false,
          }
        : { knowledgeBaseIds: [], enabledTools: ['current_time'], retrieveAlways: false },
    ),
  });
  if (!knowledgeOn) console.log('反向验证：已解绑知识库并移除 knowledge_search');
  if (args.sw === 'reviewer') console.log('反向验证：审查器恒通过（reviewer-off）');
  if (args.sw === 'budget') console.log('反向验证：所有协作 maxRounds=1');
  console.log(`开始评估：${golden.cases.length} 用例（switch=${args.sw}）\n`);

  const results = [];
  let skipped = 0;
  for (const testCase of golden.cases) {
    const marks = testCase.breaksWith ?? [];
    if (args.sw !== 'none') {
      // 急停用例是专项操作，不参与任何开关矩阵
      if (testCase.cancelAfterFirstEvent) {
        skipped += 1;
        console.log(`SKIP  ${testCase.id.padEnd(30)}急停专项不参与开关矩阵`);
        continue;
      }
      // 标注了其他开关但不含当前开关 → 与本态无关
      if (marks.length > 0 && !marks.includes(args.sw)) {
        skipped += 1;
        console.log(`SKIP  ${testCase.id.padEnd(30)}反向标注 [${marks.join(', ')}] 不含 ${args.sw}`);
        continue;
      }
    }
    const isReverse = args.sw !== 'none' && marks.includes(args.sw);
    let reasons = [];
    try {
      reasons = await runCase(args.baseUrl, stack.assistantId, testCase, args.sw);
    } catch (error) {
      reasons = [error instanceof Error ? error.message : String(error)];
    }
    const pass = isReverse ? reasons.length > 0 : reasons.length === 0;
    results.push({
      id: testCase.id,
      category: testCase.category,
      pass,
      reason: isReverse
        ? reasons.length > 0
          ? 'OK：开关生效后如期降级'
          : '反向失败：开关后仍满足预期'
        : reasons.length === 0
          ? `[${testCase.category}] 符合预期`
          : undefined,
      failedReasons: reasons,
    });
    console.log(
      `${pass ? 'PASS' : 'FAIL'}  ${testCase.id.padEnd(30)}${results.at(-1).reason ?? reasons.join('；')}`,
    );
  }

  const summary = summarize(results, {
    name: `eval-agent(${args.sw})`,
    meta: { switch: args.sw, caseCount: golden.cases.length - skipped, skipped },
  });
  const code = printSummary(summary);
  if (args.out) await writeReport(args.out, summary);
  process.exit(code);
}

main().catch((error) => {
  console.error(`\n评估中断：${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
