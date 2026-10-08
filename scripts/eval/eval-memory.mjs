#!/usr/bin/env node
/**
 * v0.5 P1-2 长期记忆回归评估（golden set + LLM-as-judge）。
 *
 * 前置条件：
 *   1. Web 服务正在运行（默认 http://127.0.0.1:3000，可用 --base-url 覆盖）；
 *   2. 已配置默认对话模型与嵌入模型（Ollama 或 OpenAI 兼容供应商均可）；
 *   3. 存在 memoryEnabled=true 的助手（内置助手默认开启）。
 *
 * 用法：
 *   node scripts/eval/eval-memory.mjs --reset-memories
 *     --reset-memories  先清空记忆库再写入 golden 种子记忆（破坏性，必须显式传入）
 *     --base-url=URL    指定服务地址
 *     --judge=off       关闭 LLM-as-judge，只跑关键词命中
 *     --out=PATH        结果同时写入 JSON 文件
 *
 * 退出码：基础设施错误（连不上服务/模型报错）= 2；关键词命中率 < 70% = 1；否则 0。
 *
 * v1.1 M5：HTTP/SSE/关键词断言改消费 scripts/eval/lib（本文件只保留记忆域编排与
 * LLM-as-judge 汇总），行为、报告格式、退出码均不变。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { api } from './lib/http.mjs';
import { streamChat } from './lib/sse-client.mjs';
import { outputContainsAny } from './lib/assertions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, 'memory-golden.json');
const KEYWORD_PASS_RATIO = 0.7;

function parseArgs(argv) {
  const args = { baseUrl: process.env.WBFM_BASE_URL ?? 'http://127.0.0.1:3000', reset: false, judge: true, out: null };
  for (const arg of argv.slice(2)) {
    if (arg === '--reset-memories') args.reset = true;
    else if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice('--base-url='.length);
    else if (arg === '--judge=off') args.judge = false;
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
  }
  return args;
}

async function selectAssistant(baseUrl) {
  const assistants = await api(baseUrl, '/api/assistants');
  const memoryEnabled = assistants.find((a) => a.memoryEnabled);
  if (!memoryEnabled) throw new Error('没有开启长期记忆的助手，请先在设置中开启');
  return memoryEnabled;
}

async function seedMemories(baseUrl, golden, reset) {
  if (!reset) return;
  const removed = await api(baseUrl, '/api/memories/clear', { method: 'POST', body: JSON.stringify({}) });
  console.log(`已清空旧记忆 ${removed.removed} 条，写入 golden 种子 ${golden.seedMemories.length} 条…`);
  for (const memory of golden.seedMemories) {
    await api(baseUrl, '/api/memories', { method: 'POST', body: JSON.stringify(memory) });
  }
}

const JUDGE_PROMPT = (question, expected, answer) => `你是严格的评测员。根据「用户问题」与「应命中的要点」评判回答质量。
只输出 JSON，不要输出其他内容：{"score":0|1|2,"reason":"不超过30字"}
评分：2=准确命中要点；1=部分沾边但不完整；0=未命中或编造。
用户问题：${question}
应命中要点（任一即可）：${expected.join(' / ')}
回答：${answer}`;

async function llmJudge(baseUrl, assistantId, testCase, answer) {
  if (!answer.trim()) return { score: 0, reason: '空回答' };
  const conversation = await api(baseUrl, '/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ assistantId, title: 'judge' }),
  });
  const { content, error } = await streamChat(baseUrl, '/api/chat/stream', {
    assistantId,
    conversationId: conversation.id,
    content: JUDGE_PROMPT(testCase.question, testCase.anyOf, answer),
  });
  if (error) return { score: 0, reason: `judge 流错误：${error}` };
  const match = content.match(/"score"\s*:\s*([0-2])/);
  const reasonMatch = content.match(/"reason"\s*:\s*"([^"]*)"/);
  return {
    score: match ? Number(match[1]) : 0,
    reason: reasonMatch ? reasonMatch[1] : '无法解析评分',
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.reset) {
    console.error('请显式传入 --reset-memories 确认清空并重建评估记忆库后再运行。');
    process.exit(2);
  }
  const golden = JSON.parse(await readFile(GOLDEN_PATH, 'utf-8'));

  const assistant = await selectAssistant(args.baseUrl);
  await seedMemories(args.baseUrl, golden, args.reset);
  console.log(`使用助手「${assistant.name}」(${assistant.id})，共 ${golden.cases.length} 个评估用例\n`);

  const results = [];
  for (const testCase of golden.cases) {
    const conversation = await api(args.baseUrl, '/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ assistantId: assistant.id, title: `eval-${testCase.id}` }),
    });
    const { content, error } = await streamChat(args.baseUrl, '/api/chat/stream', {
      assistantId: assistant.id,
      conversationId: conversation.id,
      content: testCase.question,
    });
    const hitResult = error ? { pass: false } : outputContainsAny(content, testCase.anyOf);
    const hit = hitResult.pass;
    const judge = args.judge
      ? await llmJudge(args.baseUrl, assistant.id, testCase, content)
      : null;
    results.push({ id: testCase.id, question: testCase.question, hit, judge, answer: content, error });
    const judgeText = judge ? ` judge=${judge.score}` : '';
    console.log(`${hit ? 'PASS' : 'FAIL'}  ${testCase.id.padEnd(26)}${judgeText}${error ? `  (${error})` : ''}`);
  }

  const passCount = results.filter((r) => r.hit).length;
  const ratio = passCount / results.length;
  const judged = results.filter((r) => r.judge);
  const judgeAvg = judged.length
    ? judged.reduce((sum, r) => sum + r.judge.score, 0) / judged.length
    : null;
  console.log(`\n关键词命中：${passCount}/${results.length}（${(ratio * 100).toFixed(0)}%，阈值 ${KEYWORD_PASS_RATIO * 100}%）`);
  if (judgeAvg !== null) console.log(`LLM 评委均分：${judgeAvg.toFixed(2)} / 2`);

  if (args.out) {
    await writeFile(args.out, JSON.stringify({ at: new Date().toISOString(), ratio, judgeAvg, results }, null, 2), 'utf-8');
    console.log(`结果已写入 ${args.out}`);
  }
  process.exit(ratio >= KEYWORD_PASS_RATIO ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n评估中断：${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
