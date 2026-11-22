#!/usr/bin/env node
/**
 * v4.20 M3：冷启动采样（本机浏览器）。
 *
 * 打开 `/chat`，等输入区可交互且 `wbfm:app-ready` 打点存在，
 * 读取 Performance Timeline 的冷启动耗时，输出为 chat-report 可消费的样本文件。
 *
 * 前置：已有可访问的 Web 服务（`pnpm dev:web` 或 `next start`）。
 * 用法：node scripts/perf/chat-samples.mjs [--url=http://127.0.0.1:3200/chat] [--runs=3] [--out=PATH]
 * 退出码：0 成功；2 采样失败。
 */
import os from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_OUT = 'test-results/perf/samples-cold-start.json';

function parseArgs(argv) {
  const args = {
    url: process.env.WBFM_PERF_URL ?? 'http://127.0.0.1:3200/chat',
    runs: Number(process.env.WBFM_PERF_RUNS ?? 3),
    out: DEFAULT_OUT,
  };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length);
    else if (arg.startsWith('--runs=')) args.runs = Number(arg.slice('--runs='.length));
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else throw new Error(`未知参数：${arg}`);
  }
  if (!Number.isInteger(args.runs) || args.runs < 1) throw new Error('--runs 需要正整数');
  return args;
}

function resolveOut(raw) {
  return isAbsolute(raw) ? raw : join(ROOT, raw);
}

async function sampleOnce(browser, url) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="composer"]', { timeout: 60_000 });
    await page.waitForFunction(
      () => performance.getEntriesByName('wbfm:app-ready').length > 0,
      undefined,
      { timeout: 60_000 },
    );
    const coldStartMs = await page.evaluate(() => {
      const entry = performance.getEntriesByName('wbfm:app-ready')[0];
      return entry ? Math.round(entry.startTime) : null;
    });
    if (typeof coldStartMs !== 'number' || coldStartMs <= 0) {
      throw new Error('未读取到有效的冷启动打点');
    }
    return { coldStartMs };
  } finally {
    await context.close();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const browser = await chromium.launch();
  try {
    const samples = [];
    for (let index = 0; index < args.runs; index += 1) {
      const sample = await sampleOnce(browser, args.url);
      samples.push(sample);
      console.log(`  run ${index + 1}/${args.runs}: coldStartMs=${sample.coldStartMs}`);
    }
    const payload = {
      env: {
        platform: os.platform(),
        arch: os.arch(),
        cpuCount: os.cpus().length,
        node: process.versions.node,
      },
      scenarios: [{ name: 'cold-start', samples }],
    };
    const out = resolveOut(args.out);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
    console.log(`样本已写入：${out}`);
    console.log('生成报告：pnpm perf:chat-report --input=' + args.out);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`冷启动采样失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
