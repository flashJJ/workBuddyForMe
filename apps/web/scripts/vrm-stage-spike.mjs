#!/usr/bin/env node
/**
 * v2.0 M0 VRM 真机性能 spike 驱动（一次性真机取证工具，非自动化测试）。
 *
 * 前置：
 *   pnpm build:web
 *   $env:WBFM_SPIKE='1'; pnpm --filter @wbfm/web exec next start -H 127.0.0.1 -p 3105
 *
 * 用法（apps/web 目录）：
 *   node scripts/vrm-stage-spike.mjs [--url http://127.0.0.1:3105] [--headed] [--out path.json]
 *
 * 60MB 大模型档（样本不入库）：把自备 VRM 放到 scripts/fixtures/vrm/big.vrm，
 * 白名单另加；或在浏览器手工打开 /spike/vrm-stage 观察（M0 报告记录 10MB 基线即可）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? 'true') : fallback;
};

const baseUrl = arg('url', 'http://127.0.0.1:3105').replace(/\/$/, '');
const headed = arg('headed', 'true') !== 'false';
const outPath = resolve(arg('out', '../../docs/plan/v2.0/spike-vrm-result.json'));
// sniff 0.5s + 2×(300ms 挂载 + 12s warmup + 15s measure + 3s teardown) ≈ 61s
const TOTAL_TIMEOUT_MS = 180_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  headless: !headed,
  args: ['--window-size=1920,1080', '--force-color-profile=srgb', '--enable-gpu-rasterization'],
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

console.log(`[vrm-spike] ${headed ? 'headed' : 'headless'} @1920x1080 -> ${baseUrl}/spike/vrm-stage`);
await page.goto(`${baseUrl}/spike/vrm-stage`, { waitUntil: 'domcontentloaded' });

const start = Date.now();
while (Date.now() - start < TOTAL_TIMEOUT_MS) {
  const state = await page.getByTestId('spike-status').textContent().catch(() => '');
  if (state === 'done') break;
  if (state) process.stdout.write(`\r[vrm-spike] ${state}   `);
  await sleep(2000);
}
process.stdout.write('\n');

const state = await page.getByTestId('spike-status').textContent();
if (state !== 'done') {
  console.error(`[vrm-spike] 未在 ${TOTAL_TIMEOUT_MS / 1000}s 内完成（last=${state}）`);
  console.error(errors.slice(0, 10).join('\n'));
  await browser.close();
  process.exit(1);
}

const report = JSON.parse(await page.getByTestId('spike-result').textContent());
report.collectedAt = new Date().toISOString();
report.runner = { headed, viewport: '1920x1080', pageErrors: errors };

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`[vrm-spike] 结果写入 ${outPath}`);
for (const s of report.sniff) {
  console.log(`  sniff ${s.fixture.padEnd(16)} ok=${s.result.ok} ${s.result.reason ?? s.result.vrmVersion ?? ''}`);
}
for (const r of report.results) {
  const m = r.metrics;
  const load = r.load ? ` firstFrame=${r.load.firstFrameMs}ms(${r.load.vrmVersion})` : '';
  const heap = m.heap ? ` heap ${m.heap.startMb}→${m.heap.endMb}MB peak ${m.heap.peakMb}MB` : '';
  console.log(
    `  ${r.key.padEnd(4)} vrm=${r.vrmCount} live2d=${r.live2dCount} fps=${m.fpsMean} 1%low=${m.fpsOnePercentLow} ` +
      `p95=${m.frameP95}ms p99=${m.frameP99}ms long=${m.longFrames} hitch=${m.hitchFrames}${load}${heap}`,
  );
}
if (errors.length > 0) console.log(`[vrm-spike] 页面错误 ${errors.length} 条（已随 JSON 保存）`);
await browser.close();
