#!/usr/bin/env node
/**
 * v1.3 M5 知识检索评估（T5.1 golden + T5.2 反向验证）。
 *
 * 前置：WBFM_MOCK_AI=1 的 server（--base-url，默认 3200）。mock embedding 为
 * 确定性 2-gram 多热向量、mock chat 回显【参考资料】首条目正文——回答命中
 * 期望文本即等价于「期望事实位于检索第一名」，全程零外网、可门禁化。
 *
 * 用法：
 *   node scripts/eval/eval-knowledge.mjs [--base-url=URL] [--out=PATH] [--switch=fts|compile]
 *   --switch=fts     反向：关混合检索（FTS+规则重排）并同步关编译路由
 *                    （精确编号题的实体兜底会掩盖 FTS 缺位，故一并关闭以隔离关键词通道贡献）
 *   --switch=compile 反向：仅关编译优先路由（静态知识层）
 *   正向（无 --switch）：全部用例必须通过。
 *   反向：breaksWith 命中该开关的用例必须失败，其余（含语义护栏题）必须仍通过。
 *
 * 退出码：0 全过；1 断言失败；2 基础设施错误。
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { api } from './lib/http.mjs';
import { streamChat, eventsOf } from './lib/sse-client.mjs';
import { outputContainsAny } from './lib/assertions.mjs';
import { summarize, printSummary, writeReport } from './lib/report.mjs';
import { ensureMockStack } from './lib/mock-seed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, 'knowledge-golden.json');
const SWITCH_SETTINGS = {
  fts: { hybridRetrievalEnabled: false, compileRoutingEnabled: false },
  compile: { hybridRetrievalEnabled: true, compileRoutingEnabled: false },
  none: { hybridRetrievalEnabled: true, compileRoutingEnabled: true },
};

/** 极简 --k=v 解析（lib 的 parseArgs 以含 -- 的原始键查表，容易错配，这里内联防呆） */
function readArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    const eq = arg.indexOf('=');
    if (eq > 0) out[arg.slice(0, eq).replace(/^-+/, '')] = arg.slice(eq + 1);
  }
  return out;
}

/** multipart 上传文档（api() 固定 json 头，这里用裸 fetch 保留 boundary） */
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 轮询直到库内全部文档编译 ready（规则通道零模型调用，通常上传返回即已 ready） */
async function waitCompileReady(baseUrl, kbId, expectCount, { timeout = 60_000 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const docs = await api(baseUrl, `/api/knowledge-bases/${kbId}/documents`);
    if (docs.length >= expectCount) {
      const failed = docs.filter((d) => d.compileStatus === 'failed');
      if (failed.length > 0) {
        throw new Error(`编译失败：${failed.map((d) => d.filename).join('、')}`);
      }
      if (docs.every((d) => d.compileStatus === 'ready')) return docs.length;
    }
    if (Date.now() > deadline) {
      throw new Error(`等待编译超时（${docs.length}/${expectCount}）`);
    }
    await sleep(500);
  }
}

async function seedKnowledgeBase(baseUrl, golden) {
  const kb = await api(baseUrl, '/api/knowledge-bases', {
    method: 'POST',
    body: JSON.stringify({ name: `eval-knowledge-${Date.now()}` }),
  });
  for (const doc of golden.seedDocuments) {
    await uploadDocument(baseUrl, kb.id, doc.name, doc.content);
  }
  const ready = await waitCompileReady(baseUrl, kb.id, golden.seedDocuments.length);
  console.log(`知识库 ${kb.id} 就绪：${golden.seedDocuments.length} 文档全部编译完成（ready=${ready}）`);
  return kb;
}

/** 断言 citations 期望：staticKind 存在 / 段落坐标非空 / 去重文档数 */
function checkExpectations(citations, expect = {}) {
  const reasons = [];
  if (expect.staticKind && !citations.some((c) => c.staticKind === expect.staticKind)) {
    reasons.push(`缺少 ${expect.staticKind} 层引用`);
  }
  if (expect.paragraph) {
    const ok = citations.some(
      (c) => c.staticKind === expect.staticKind && typeof c.paragraphNo === 'number' && c.paragraphNo >= 1,
    );
    if (!ok) reasons.push(`${expect.staticKind} 引用缺少段落坐标`);
  }
  if (typeof expect.distinctDocs === 'number') {
    const distinct = new Set(citations.map((c) => c.documentName)).size;
    if (distinct < expect.distinctDocs) reasons.push(`引用文档数 ${distinct} < ${expect.distinctDocs}`);
  }
  return reasons;
}

async function runCase(baseUrl, assistantId, testCase) {
  const conversation = await api(baseUrl, '/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ assistantId, title: `eval-kb-${testCase.id}` }),
  });
  const { content, events, error } = await streamChat(baseUrl, '/api/chat/stream', {
    assistantId,
    conversationId: conversation.id,
    content: testCase.question,
  });
  if (error) return { pass: false, failedReasons: [`流错误：${error}`] };

  const reasons = [];
  if (!outputContainsAny(content, testCase.anyOf).pass) {
    reasons.push(`回答未命中期望文本（anyOf=${testCase.anyOf.join('/')}）`);
  }
  const citations = eventsOf(events, 'citations').at(-1)?.citations ?? [];
  reasons.push(...checkExpectations(citations, testCase.expect));
  return reasons.length === 0
    ? { pass: true, reason: `命中：${(citations[0]?.documentName ?? '无引用')}` }
    : { pass: false, failedReasons: reasons, answer: content.slice(0, 120) };
}

async function main() {
  const argv = readArgs(process.argv);
  const args = {
    baseUrl: argv['base-url'] ?? process.env.WBFM_BASE_URL ?? 'http://127.0.0.1:3200',
    out: argv.out ?? '',
    sw: argv.switch ?? 'none',
  };
  const sw = args.sw;
  if (sw !== 'none' && !SWITCH_SETTINGS[sw]) {
    console.error(`未知 --switch=${sw}（可选 fts|compile）`);
    process.exit(2);
  }
  const golden = JSON.parse(await readFile(GOLDEN_PATH, 'utf-8'));
  const stack = await ensureMockStack(args.baseUrl);

  // 助手绑定知识库并开强制检索（always 路径是 eval 的唯一检索入口）
  await api(args.baseUrl, `/api/assistants/${stack.assistantId}`, {
    method: 'PATCH',
    body: JSON.stringify({ knowledgeBaseId: null }),
  });
  const kb = await seedKnowledgeBase(args.baseUrl, golden);
  await api(args.baseUrl, `/api/assistants/${stack.assistantId}`, {
    method: 'PATCH',
    body: JSON.stringify({ knowledgeBaseId: kb.id, retrieveAlways: true }),
  });

  // 每轮显式写入开关组合（none=全开复位，防上一轮反向状态残留）
  await api(args.baseUrl, '/api/settings', {
    method: 'PUT',
    body: JSON.stringify(SWITCH_SETTINGS[sw]),
  });
  if (sw !== 'none') {
    console.log(`反向验证：已写入开关 ${JSON.stringify(SWITCH_SETTINGS[sw])}`);
  }
  console.log(`开始评估：${golden.cases.length} 用例（switch=${sw}）\n`);

  const results = [];
  let skipped = 0;
  for (const testCase of golden.cases) {
    const marks = testCase.breaksWith ?? [];
    // 标注题只在其标注的开关态做反向判定；标注不含当前开关时该态与其无关（SKIP）；
    // 无标注护栏题在任何开关态都必须仍命中（基线不被开关破坏）
    const isReverse = sw !== 'none' && marks.includes(sw);
    const isIrrelevant = sw !== 'none' && marks.length > 0 && !marks.includes(sw);
    if (isIrrelevant) {
      skipped += 1;
      console.log(`SKIP  ${testCase.id.padEnd(28)}反向标注 [${marks.join(', ')}] 不含当前开关 ${sw}`);
      continue;
    }
    const outcome = await runCase(args.baseUrl, stack.assistantId, testCase);
    const pass = isReverse ? !outcome.pass : outcome.pass;
    results.push({
      id: testCase.id,
      pass,
      reason: isReverse
        ? outcome.pass
          ? '反向失败：开关关闭后仍命中（增强非必需？）'
          : 'OK：关闭后如期降级'
        : outcome.reason,
      failedReasons: outcome.failedReasons,
    });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${testCase.id.padEnd(28)}${results.at(-1).reason}`);
  }

  const summary = summarize(results, {
    name: `eval-knowledge(${sw})`,
    meta: {
      switch: sw,
      kbId: kb.id,
      caseCount: golden.cases.length - skipped,
      skipped,
    },
  });
  const code = printSummary(summary);
  if (args.out) await writeReport(args.out, summary);
  process.exit(code);
}

main().catch((error) => {
  console.error(`\n评估中断：${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
