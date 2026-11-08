#!/usr/bin/env node
/**
 * v2.28 P2：记忆 golden 本地基线报告（hit@3 / 零召回率 / 召回耗时）。
 *
 * 与 eval-memory.mjs 的区别：不启动 Web 服务、不调用对话模型与 LLM 评委，
 * 直接在内存 SQLite 上复用 core 的召回管线，适合调整召回权重前后做快速对比。
 * 未配置嵌入模型时走纯关键词通道，报告会标注 channel=keyword。
 *
 * 用法：
 *   pnpm memory:eval
 *   pnpm memory:eval -- --out=docs/eval/memory-report.json
 *
 * 输出：控制台表格 + JSON 文件（默认 docs/eval/memory-report.json）。
 * 只写本地文件，不上传，也不作为 CI 必过项；退出码恒为 0（读取失败除外）。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createDatabase } from '../../packages/database/dist/index.mjs';
import {
  createMemoryService,
  createWebCipher,
} from '../../packages/core/dist/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const GOLDEN_PATH = join(HERE, 'memory-golden.json');
const DEFAULT_OUT = join(ROOT, 'docs/eval/memory-report.json');
const TOP_K = 3;

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--out=')) args.out = resolve(arg.slice('--out='.length));
  }
  return args;
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

/** 读取上一版报告，用于计算指标差值（不存在时返回 null） */
async function readPrevious(outPath) {
  try {
    return JSON.parse(await readFile(outPath, 'utf-8'));
  } catch {
    return null;
  }
}

function delta(current, previous) {
  if (typeof previous !== 'number') return '—';
  const diff = current - previous;
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(3)}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const previous = await readPrevious(args.out);
  const golden = JSON.parse(await readFile(GOLDEN_PATH, 'utf-8'));

  const db = createDatabase(':memory:');
  const memory = createMemoryService({ db, cipher: createWebCipher() });
  await memory.rememberCandidates(
    golden.seedMemories.map((item) => ({
      kind: item.kind,
      content: item.content,
      importance: item.importance,
    })),
  );

  const results = [];
  for (const testCase of golden.cases) {
    const started = performance.now();
    const recalled = await memory.recall(testCase.question);
    const elapsedMs = performance.now() - started;
    const top = recalled.slice(0, TOP_K);
    results.push({
      id: testCase.id,
      question: testCase.question,
      hit: top.some((item) => containsAny(item.content, testCase.anyOf)),
      topContents: top.map((item) => item.content),
      elapsedMs: Number(elapsedMs.toFixed(2)),
    });
  }

  const hitCount = results.filter((item) => item.hit).length;
  const hitRate = hitCount / results.length;
  const elapsed = results.map((item) => item.elapsedMs);
  const avgMs = elapsed.reduce((sum, value) => sum + value, 0) / elapsed.length;
  const stats = memory.getStats();
  const report = {
    version: 'v2.28',
    at: new Date().toISOString(),
    channel: 'keyword',
    topK: TOP_K,
    cases: results.length,
    hitAt3: Number(hitRate.toFixed(3)),
    zeroRecallRate: stats.zeroRecallRate,
    recallTotal: stats.recallTotal,
    avgRecallMs: Number(avgMs.toFixed(2)),
    maxRecallMs: Number(Math.max(...elapsed).toFixed(2)),
    results,
  };

  console.log(`\n记忆基线报告（${report.channel} 通道，top-${TOP_K}）`);
  console.log(`用例 ${report.cases} · hit@3 ${report.hitAt3} · 零召回率 ${report.zeroRecallRate.toFixed(2)} · 平均召回 ${report.avgRecallMs}ms`);
  console.log(`对比上一版：hit@3 ${delta(report.hitAt3, previous?.hitAt3)} · 零召回率 ${delta(report.zeroRecallRate, previous?.zeroRecallRate)} · 平均耗时 ${delta(report.avgRecallMs, previous?.avgRecallMs)}`);
  for (const item of results) {
    console.log(`${item.hit ? 'HIT ' : 'MISS'}  ${item.id.padEnd(26)} ${item.elapsedMs.toFixed(2)}ms`);
  }

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`\n报告已写入 ${args.out}`);
  db.close();
}

main().catch((error) => {
  console.error(`\n报告生成中断：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
