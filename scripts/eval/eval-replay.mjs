#!/usr/bin/env node
/**
 * v4.18 M5：离线 A/B 回放与上下文保真报告。
 *
 * 同一组 golden 用例（context-golden.json 的 replay 段 + longTurns）分别用基线策略
 * 与候选策略各跑一遍：写两条硬约束记忆 → 灌入历史事实与填充轮 → 用 `[eval-replay]`
 * 探针读取真实入模消息，回报记忆/引用/约束标记是否仍在上下文里。
 *
 * 指标固定五项（replay-contract.mjs）：预算占用、截断率、记忆保留、引用保留、约束保留。
 * 报告固定落 test-results/eval-replay/report.json 与 report.md；不含绝对路径、正文与密钥。
 *
 * 前置：WBFM_MOCK_AI=1 的 server（pnpm eval:replay 会经 with-server 自动起临时服务）。
 * 用法：node scripts/eval/eval-replay.mjs [--base-url=URL] [--baseline=名称] [--candidate=名称] [--out-dir=PATH]
 * 退出码：0 通过；1 阈值/隐私/确定性失败；2 基础设施错误。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './lib/http.mjs';
import { streamChat } from './lib/sse-client.mjs';
import { ensureMockStack } from './lib/mock-seed.mjs';
import {
  REPLAY_REPORT_DIR,
  REPLAY_REPORT_JSON,
  REPLAY_REPORT_MARKDOWN,
  createReplayReport,
  evaluateReplayReport,
  findSensitiveContent,
} from './lib/replay-contract.mjs';
import {
  computeReplayMetrics,
  renderReplayMarkdown,
  stableReportJson,
} from './lib/replay-report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const GOLDEN_PATH = join(HERE, 'context-golden.json');
const KB_NAME = 'eval-replay-citation';
/** 评测助手只保留记忆与检索，避免角色卡/技能/工具挤占系统预算 */
const EVAL_ASSISTANT_PATCH = {
  memoryEnabled: true,
  expressionEnabled: false,
  cardId: null,
  enabledTools: [],
  skillNames: ['__eval_replay_none__'],
  retrieveAlways: true,
  fallbackModelId: null,
};

function readArgs(argv) {
  const args = {
    baseUrl: process.env.WBFM_BASE_URL ?? 'http://127.0.0.1:3200',
    baseline: process.env.WBFM_REPLAY_BASELINE ?? '',
    candidate: process.env.WBFM_REPLAY_CANDIDATE ?? '',
    outDir: '',
  };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice('--base-url='.length);
    else if (arg.startsWith('--baseline=')) args.baseline = arg.slice('--baseline='.length);
    else if (arg.startsWith('--candidate=')) args.candidate = arg.slice('--candidate='.length);
    else if (arg.startsWith('--out-dir=')) args.outDir = arg.slice('--out-dir='.length);
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value) => Math.round(value * 1000) / 1000;

function latestEvent(events, type) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].type === type) return events[i];
  }
  return null;
}

/** multipart 上传文档（api() 固定 JSON 头，这里保留 boundary） */
async function uploadDocument(baseUrl, kbId, name, content) {
  const form = new FormData();
  form.append('file', new Blob([content], { type: 'text/plain' }), name);
  const response = await fetch(`${baseUrl}/api/knowledge-bases/${kbId}/documents`, {
    method: 'POST',
    body: form,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(`上传 ${name} 失败（HTTP ${response.status}）`);
  }
  return payload.data;
}

async function waitDocumentReady(baseUrl, kbId, filename, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const docs = await api(baseUrl, `/api/knowledge-bases/${kbId}/documents`);
    const doc = docs.find((item) => item.filename === filename);
    if (doc?.compileStatus === 'failed') throw new Error(`引用夹具编译失败：${filename}`);
    if (doc?.compileStatus === 'ready') return;
    if (Date.now() > deadline) throw new Error(`等待引用夹具编译超时：${filename}`);
    await sleep(500);
  }
}

async function ensureCitationKnowledgeBase(baseUrl, citationDocument) {
  const existing = await api(baseUrl, '/api/knowledge-bases');
  let kb = existing.find((item) => item.name === KB_NAME);
  if (!kb) {
    kb = await api(baseUrl, '/api/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify({ name: KB_NAME }),
    });
  }
  const docs = await api(baseUrl, `/api/knowledge-bases/${kb.id}/documents`);
  if (!docs.some((item) => item.filename === citationDocument.name)) {
    await uploadDocument(baseUrl, kb.id, citationDocument.name, citationDocument.content);
    console.log(`引用夹具已上传：${citationDocument.name}`);
  }
  await waitDocumentReady(baseUrl, kb.id, citationDocument.name);
  return kb.id;
}

async function ensureStrategyAssistant(baseUrl, seed, kbId, strategy) {
  const models = await api(baseUrl, `/api/providers/${seed.providerId}/models`);
  const modelId = `eval-replay-${strategy.name}`;
  let model = models.find((item) => item.modelId === modelId);
  if (!model) {
    model = await api(baseUrl, `/api/providers/${seed.providerId}/models`, {
      method: 'POST',
      body: JSON.stringify({
        modelId,
        capabilities: ['chat'],
        contextWindow: strategy.contextWindow,
      }),
    });
  }

  const name = `eval-replay-${strategy.name}`;
  const assistants = await api(baseUrl, '/api/assistants');
  const existing = assistants.find((item) => item.name === name);
  const patch = {
    ...EVAL_ASSISTANT_PATCH,
    name,
    modelId: model.id,
    knowledgeBaseIds: [kbId],
    systemPrompt: '你是离线 A/B 回放的评测助手，只按用户消息作答。',
  };
  const assistant = existing
    ? await api(baseUrl, `/api/assistants/${existing.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
    : await api(baseUrl, '/api/assistants', {
        method: 'POST',
        body: JSON.stringify(patch),
      });
  return assistant.id;
}

async function applyStrategySettings(baseUrl, strategy) {
  await api(baseUrl, '/api/settings', {
    method: 'PUT',
    body: JSON.stringify({
      contextMessageCount: strategy.contextMessageCount,
      contextPreflightCompactEnabled: strategy.preflightCompact,
    }),
  });
}

function buildProbeText(groups) {
  const spec = Object.entries(groups)
    .map(([group, markers]) => `${group}=${markers.join('|')}`)
    .join(';');
  return `[eval-replay] ${spec}`;
}

function buildTurns(golden, groups) {
  const turns = [];
  golden.replay.seedTurns.forEach((content, index) => {
    turns.push({ id: `seed-${index + 1}`, content });
  });
  golden.longTurns.forEach((content, index) => {
    turns.push({ id: `long-${index + 1}`, content });
  });
  golden.replay.fillerTurns.forEach((content, index) => {
    turns.push({ id: `filler-${index + 1}`, content });
  });
  turns.push({ id: 'probe', content: buildProbeText(groups) });
  return turns;
}

function parseProbe(content) {
  const match = content.match(/eval-replay\s+(\{[\s\S]*\})/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function toTurnRecord(turn, snapshot) {
  const payload = snapshot?.payload ?? {};
  const usableWindow = Number(payload.usableWindow) || 0;
  const used =
    (Number(payload.systemTokens) || 0) +
    (Number(payload.toolsTokens) || 0) +
    (Number(payload.reserveTokens) || 0) +
    (Number(payload.historyTokens) || 0);
  return {
    id: turn.id,
    budgetUsage: usableWindow > 0 ? round(used / usableWindow) : 0,
    truncated: Boolean(payload.truncated),
    keptMessages: Number(payload.keptMessages) || 0,
    droppedMessages: Number(payload.droppedMessages) || 0,
  };
}

async function runStrategy({ baseUrl, assistantId, strategy, turns }) {
  const conversation = await api(baseUrl, '/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ assistantId, title: `eval-replay-${strategy.name}` }),
  });
  const records = [];
  let retention = null;
  for (const turn of turns) {
    const result = await streamChat(baseUrl, '/api/chat/stream', {
      assistantId,
      conversationId: conversation.id,
      content: turn.content,
    });
    if (result.error) throw new Error(`策略 ${strategy.name} 的 ${turn.id} 对话失败：${result.error}`);
    const timeline = await api(
      baseUrl,
      `/api/events?scope=chat&scopeId=${encodeURIComponent(conversation.id)}&limit=500`,
    );
    const record = toTurnRecord(turn, latestEvent(timeline.events, 'context_snapshot'));
    if (turn.id === 'probe') {
      retention = parseProbe(result.content);
      if (!retention) throw new Error('回放探针未返回可解析结果');
    }
    records.push(record);
  }
  return { records, retention: retention ?? {} };
}

function collectCases(strategyName, records) {
  return records.map((record) => ({ strategy: strategyName, ...record }));
}

function resolveOutDir(raw) {
  const target = raw || REPLAY_REPORT_DIR;
  return isAbsolute(target) ? target : join(ROOT, target);
}

function readStrategy(golden, name, label) {
  const strategy = golden.replay.strategies[name];
  if (!strategy) {
    throw new Error(`未知的 ${label}策略：${name}（可选：${Object.keys(golden.replay.strategies).join(', ')}）`);
  }
  return { name, ...strategy };
}

function assertStable(report) {
  const first = stableReportJson(report);
  const second = stableReportJson({ ...report });
  if (first !== second) throw new Error('报告确定性检查失败：同一输入生成了不同结果');
}

async function main() {
  const args = readArgs(process.argv);
  const golden = JSON.parse(await readFile(GOLDEN_PATH, 'utf-8'));
  const replay = golden.replay;
  if (!replay) throw new Error('context-golden.json 缺少 replay 段');

  const baselineName = args.baseline || replay.defaults.baseline;
  const candidateName = args.candidate || replay.defaults.candidate;
  const baselineStrategy = readStrategy(golden, baselineName, '基线');
  const candidateStrategy = readStrategy(golden, candidateName, '候选');

  const seed = await ensureMockStack(args.baseUrl);
  const kbId = await ensureCitationKnowledgeBase(args.baseUrl, replay.citationDocument);
  const baselineAssistantId = await ensureStrategyAssistant(
    args.baseUrl,
    seed,
    kbId,
    baselineStrategy,
  );
  const candidateAssistantId = await ensureStrategyAssistant(
    args.baseUrl,
    seed,
    kbId,
    candidateStrategy,
  );
  const turns = buildTurns(golden, replay.probe.groups);

  const originalSettings = await api(args.baseUrl, '/api/settings');
  console.log(
    `开始回放：${args.baseUrl}\n基线 ${baselineStrategy.name}（${baselineStrategy.contextWindow}）` +
      ` / 候选 ${candidateStrategy.name}（${candidateStrategy.contextWindow}），${turns.length} 轮 × 2\n`,
  );

  let baseline;
  let candidate;
  try {
    await applyStrategySettings(args.baseUrl, baselineStrategy);
    baseline = await runStrategy({
      baseUrl: args.baseUrl,
      assistantId: baselineAssistantId,
      strategy: baselineStrategy,
      turns,
    });
    await applyStrategySettings(args.baseUrl, candidateStrategy);
    candidate = await runStrategy({
      baseUrl: args.baseUrl,
      assistantId: candidateAssistantId,
      strategy: candidateStrategy,
      turns,
    });
  } finally {
    await api(args.baseUrl, '/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        contextMessageCount: originalSettings.contextMessageCount,
        contextPreflightCompactEnabled: originalSettings.contextPreflightCompactEnabled,
      }),
    }).catch(() => undefined);
  }

  const report = createReplayReport({
    golden: 'context-golden.json',
    baselineName: baselineStrategy.name,
    candidateName: candidateStrategy.name,
    baseline: computeReplayMetrics({ turns: baseline.records, retention: baseline.retention }),
    candidate: computeReplayMetrics({ turns: candidate.records, retention: candidate.retention }),
    cases: [
      ...collectCases(baselineStrategy.name, baseline.records),
      ...collectCases(candidateStrategy.name, candidate.records),
    ],
  });
  const verdict = evaluateReplayReport(report);
  const sensitive = findSensitiveContent(report);
  if (sensitive.length > 0) {
    verdict.pass = false;
    verdict.failures.push(`报告隐私检查命中：${sensitive.join('、')}`);
  }
  assertStable(report);

  const outDir = resolveOutDir(args.outDir);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, REPLAY_REPORT_JSON), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  await writeFile(
    join(outDir, REPLAY_REPORT_MARKDOWN),
    `${renderReplayMarkdown(report, verdict)}\n`,
    'utf-8',
  );

  for (const metric of Object.keys(report.metrics.candidate)) {
    console.log(
      `  ${metric.padEnd(20)} 基线 ${report.metrics.baseline[metric]}  候选 ${report.metrics.candidate[metric]}`,
    );
  }
  console.log(`\n报告：${join(outDir, REPLAY_REPORT_JSON)} / ${join(outDir, REPLAY_REPORT_MARKDOWN)}`);
  if (verdict.pass) {
    console.log(`eval-replay：PASS（${baselineStrategy.name} → ${candidateStrategy.name}）`);
    process.exit(0);
  }
  console.error('\neval-replay：FAIL');
  for (const failure of verdict.failures) console.error(`  - ${failure}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(`\n回放中断：${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
