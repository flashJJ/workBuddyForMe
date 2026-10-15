#!/usr/bin/env node
/**
 * v1.9 M0 多实例 Live2D 性能 spike 驱动（非自动化测试，是一次性真机取证工具）。
 *
 * 前置：被测服务已构建并以 WBFM_SPIKE=1 启动，例如
 *   pnpm build:web
 *   $env:WBFM_SPIKE='1'; pnpm --filter @wbfm/web exec next start -H 127.0.0.1 -p 3104
 *
 * 用法（在 apps/web 目录，保证解析到本包的 playwright）：
 *   node scripts/live2d-stage-spike.mjs [--url http://127.0.0.1:3104] [--headed] [--out path.json]
 *
 * 默认 headed + 1920x1080（与 Electron 全屏同渲染管线，vsync 真实）；
 * --headed=false 时跑新 headless（CI 粗测用，绝对帧率不等价真机）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? 'true') : fallback;
};

const baseUrl = arg('url', 'http://127.0.0.1:3104').replace(/\/$/, '');
const headed = arg('headed', 'true') !== 'false';
const outPath = resolve(arg('out', '../../docs/plan/v1.9/spike-result.json'));
// 全程约 3×(12+15+3)=90s，留 90s 余量给模型加载/编译
const TOTAL_TIMEOUT_MS = 240_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  headless: !headed,
  args: ['--window-size=1920,1080', '--force-color-profile=srgb'],
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  screen: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

console.log(`[spike] ${headed ? 'headed' : 'headless'} @1920x1080 -> ${baseUrl}/spike/live2d-stage`);
await page.goto(`${baseUrl}/spike/live2d-stage`, { waitUntil: 'domcontentloaded' });

// 等 harness 跑完三场景（每场景约 30s，硬上限 240s）
const start = Date.now();
while (Date.now() - start < TOTAL_TIMEOUT_MS) {
  const state = await page.getByTestId('spike-status').textContent().catch(() => '');
  if (state === 'done') break;
  if (state) process.stdout.write(`\r[spike] ${state}   `);
  await sleep(2000);
}
process.stdout.write('\n');

const state = await page.getByTestId('spike-status').textContent();
if (state !== 'done') {
  console.error(`[spike] 未在 ${TOTAL_TIMEOUT_MS / 1000}s 内完成（last state=${state}）`);
  console.error(errors.slice(0, 10).join('\n'));
  await browser.close();
  process.exit(1);
}

const raw = await page.getByTestId('spike-result').textContent();
const report = JSON.parse(raw);
report.collectedAt = new Date().toISOString();
report.runner = { headed, viewport: '1920x1080', pageErrors: errors };

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`[spike] 结果写入 ${outPath}`);
for (const r of report.results) {
  const m = r.metrics;
  const heap = m.heap ? ` heap ${m.heap.startMb}→${m.heap.endMb}MB peak ${m.heap.peakMb}MB` : '';
  console.log(
    `  ${r.key.padEnd(20)} n=${r.instanceCount} fps=${m.fpsMean} 1%low=${m.fpsOnePercentLow} ` +
      `p95=${m.frameP95}ms p99=${m.frameP99}ms long=${m.longFrames} hitch=${m.hitchFrames}${heap}`,
  );
}
if (errors.length > 0) console.log(`[spike] 页面错误 ${errors.length} 条（已随 JSON 保存）`);
await browser.close();
