#!/usr/bin/env node
/**
 * v4.20 M1：对话性能报告 CLI。
 *
 * 读取采样文件（浏览器侧或 E2E 导出），聚合成固定报告并写入
 * test-results/perf/，同时维护 latest.json 与最近 20 份历史。
 *
 * 输入：
 * {
 *   "env": { "platform": "win32", "arch": "x64", "cpuCount": 16, "node": "22.x" },
 *   "scenarios": [
 *     { "name": "first-token", "samples": [{ "coldStartMs": 900, "firstTokenMs": 1200,
 *       "firstParagraphMs": 1400, "completionMs": 4000 }] }
 *   ]
 * }
 *
 * 用法：node scripts/perf/chat-report.mjs --input=samples.json [--out-dir=test-results/perf] [--keep=20]
 * 退出码：0 通过；2 输入/隐私/文件错误。
 */
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHAT_PERF_DIR,
  CHAT_PERF_KEEP,
  CHAT_PERF_METRICS,
  createChatPerfReport,
  recordChatPerfReport,
} from './lib/chat-perf-report.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs(argv) {
  const args = { input: '', outDir: CHAT_PERF_DIR, keep: CHAT_PERF_KEEP };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--input=')) args.input = arg.slice('--input='.length);
    else if (arg.startsWith('--out-dir=')) args.outDir = arg.slice('--out-dir='.length);
    else if (arg.startsWith('--keep=')) args.keep = Number(arg.slice('--keep='.length));
    else throw new Error(`未知参数：${arg}`);
  }
  if (!args.input) throw new Error('缺少 --input=样本文件.json');
  if (!Number.isInteger(args.keep) || args.keep < 1) throw new Error('--keep 需要正整数');
  return args;
}

function resolveDir(raw) {
  return isAbsolute(raw) ? raw : join(ROOT, raw);
}

async function main() {
  const args = parseArgs(process.argv);
  const inputPath = isAbsolute(args.input) ? args.input : join(ROOT, args.input);
  const raw = await readFile(inputPath, 'utf-8');
  // Windows 工具常带 BOM；删掉后再解析
  const input = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!input || !Array.isArray(input.scenarios) || input.scenarios.length === 0) {
    throw new Error('样本文件缺少非空 scenarios 数组');
  }
  for (const scenario of input.scenarios) {
    if (!scenario?.name || !Array.isArray(scenario.samples) || scenario.samples.length === 0) {
      throw new Error('每个 scenario 需要 name 与非空 samples');
    }
  }

  const report = createChatPerfReport({
    env: input.env ?? {},
    scenarios: input.scenarios,
  });
  const recorded = await recordChatPerfReport({
    dir: resolveDir(args.outDir),
    report,
    keep: args.keep,
  });

  console.log(`对话性能报告：${join(resolveDir(args.outDir), recorded.name)}`);
  console.log(`latest.json 已更新；清理旧报告 ${recorded.pruned.length} 份`);
  for (const scenario of report.scenarios) {
    const parts = CHAT_PERF_METRICS.map((metric) => {
      const value = scenario.metrics[metric];
      return `${metric} p50=${value.p50 ?? '—'} p95=${value.p95 ?? '—'}`;
    });
    console.log(`  ${scenario.name}（${scenario.samples} 样本）`);
    console.log(`    ${parts.join(' · ')}`);
  }
  const budget = report.budget.firstToken;
  console.log(
    `  首字预算：p50=${budget.p50 ?? '—'}ms 阈值=${budget.threshold}ms 绝对兜底=${budget.absoluteLimit}ms`,
  );
}

main().catch((error) => {
  console.error(`性能报告失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
