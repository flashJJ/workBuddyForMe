#!/usr/bin/env node
/**
 * v4.1 P0：桌宠性能短跑门禁（相对基线不回退）。
 *
 * 场景时间线：待机 20% → 主动播放 20% → 模型热替换 30% → 小剧场进出 30%。
 * 采集 p50/p95 rAF 回调耗时、长任务、JS 堆、DOM 与 GPU 资源计数；
 * 只与 docs/perf/baseline-v4.1.json 比较，不设绝对帧率。
 *
 * 用法：
 *   node scripts/perf/perf-budget.mjs --duration-min 3 --write-baseline
 *   node scripts/perf/perf-budget.mjs --duration-min 10
 *   node scripts/perf/perf-budget.mjs --url=http://127.0.0.1:42337/pet?model=... --models=a,b
 *
 * 退出码：基线缺失/参数错误 = 2；超过阈值 = 1；通过 = 0。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_BASELINE = path.join(ROOT, 'docs/perf/baseline-v4.1.json');
const DEFAULT_OUT = path.join(ROOT, '.tmp/perf-budget.json');
const DEFAULT_MODELS = ['vrm:builtin:xuetuan', 'vrm:builtin:rankaluli'];

function parseArgs(argv) {
  const args = {
    url: 'http://127.0.0.1:42337/pet?model=vrm%3Abuiltin%3Axuetuan',
    durationMin: 10,
    intervalMin: 1,
    sampleMs: 10_000,
    baseline: DEFAULT_BASELINE,
    out: DEFAULT_OUT,
    writeBaseline: false,
    strictMachine: false,
    models: DEFAULT_MODELS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') args.url = argv[(i += 1)];
    else if (arg === '--duration-min') args.durationMin = Number(argv[(i += 1)]);
    else if (arg === '--interval-min') args.intervalMin = Number(argv[(i += 1)]);
    else if (arg === '--sample-ms') args.sampleMs = Number(argv[(i += 1)]);
    else if (arg === '--baseline') args.baseline = path.resolve(argv[(i += 1)]);
    else if (arg === '--out') args.out = path.resolve(argv[(i += 1)]);
    else if (arg === '--models') args.models = argv[(i += 1)].split(',').map((item) => item.trim()).filter(Boolean);
    else if (arg === '--write-baseline') args.writeBaseline = true;
    else if (arg === '--strict-machine') args.strictMachine = true;
    else if (arg.startsWith('--')) throw new Error(`未知参数: ${arg}`);
  }
  if (args.models.length < 2) throw new Error('--models 至少需要两个模型 id');
  if (!Number.isFinite(args.durationMin) || args.durationMin <= 0) throw new Error('--duration-min 需要正数');
  return args;
}

function machineInfo() {
  const cpus = os.cpus();
  return {
    cpu: cpus[0]?.model ?? 'unknown',
    cores: cpus.length,
    totalMemGB: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
    platform: os.platform(),
    arch: os.arch(),
  };
}

async function installInstrumentation(page) {
  await page.addInitScript(() => {
    const noop = () => {};
    window.__perfGlClears = 0;
    window.__perfGlDraws = 0;
    window.__perfErrors = 0;
    window.__perfRafDurations = [];
    window.__perfLongTasks = [];
    window.__perfModelCallbacks = [];
    window.addEventListener('error', () => {
      window.__perfErrors += 1;
    });
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__perfLongTasks.push(entry.duration);
          if (window.__perfLongTasks.length > 4000) window.__perfLongTasks.splice(0, 1000);
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      // 不支持 longtask 时保持空数组
    }
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      raf((time) => {
        const before = performance.now();
        try {
          callback(time);
        } finally {
          const durations = window.__perfRafDurations;
          durations.push(Math.max(0, performance.now() - before));
          if (durations.length > 4000) durations.splice(0, 1000);
        }
      });
    window.__perfSwapModel = (id) => {
      for (const callback of window.__perfModelCallbacks) callback(id);
    };
    window.wbfm = {
      pet: {
        open: async () => true,
        close: async () => {},
        isOpen: async () => true,
        reportHover: noop,
        reportHitProxy: noop,
        focusMain: noop,
        dragBegin: noop,
        dragTo: noop,
        dragEnd: noop,
        showMenu: noop,
        relayPerformance: noop,
        onPerformance: () => () => {},
        onOpenChange: () => () => {},
        onModelChange: (callback) => {
          window.__perfModelCallbacks.push(callback);
          return () => {
            window.__perfModelCallbacks = window.__perfModelCallbacks.filter((item) => item !== callback);
          };
        },
        confirmModel: noop,
      },
    };
  });
}

async function samplePage(page, sampleMs) {
  return page.evaluate(async (ms) => {
    const durations = window.__perfRafDurations ?? [];
    durations.length = 0;
    const longTasks = window.__perfLongTasks ?? [];
    longTasks.length = 0;
    const start = performance.now();
    let frames = 0;
    await new Promise((resolve) => {
      const tick = (now) => {
        frames += 1;
        if (now - start >= ms) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsed = performance.now() - start;
    const sorted = [...durations].sort((a, b) => a - b);
    const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
    const memory = performance.memory;
    return {
      frames,
      fps: Number(((frames / elapsed) * 1000).toFixed(1)),
      rafP50Ms: Number(at(0.5).toFixed(3)),
      rafP95Ms: Number(at(0.95).toFixed(3)),
      longTasks: longTasks.length,
      longTaskMaxMs: Number((Math.max(0, ...longTasks)).toFixed(3)),
      heapMB: memory ? Number((memory.usedJSHeapSize / 1024 / 1024).toFixed(1)) : null,
      domNodes: document.getElementsByTagName('*').length,
      resources: window.__vrmDebug?.resources?.() ?? null,
      errors: window.__perfErrors ?? 0,
    };
  }, sampleMs);
}

async function waitReady(page, timeout = 120_000) {
  await page.waitForFunction(() => Boolean(window.__vrmDebug) || Boolean(window.__petDebug), null, {
    timeout,
  });
}

async function sampleFor(page, endAt, intervalMs, phase, samples) {
  while (Date.now() < endAt) {
    const wait = Math.min(intervalMs, endAt - Date.now());
    if (wait > 0) await page.waitForTimeout(wait);
    try {
      samples.push({ ...(await samplePage(page, Math.min(10_000, intervalMs))), phase });
    } catch (error) {
      samples.push({ phase, error: error.message.slice(0, 120) });
    }
  }
}

function summarize(samples) {
  const usable = samples.filter((sample) => typeof sample.rafP50Ms === 'number');
  const avg = (key) =>
    usable.length
      ? Number((usable.reduce((sum, sample) => sum + sample[key], 0) / usable.length).toFixed(3))
      : 0;
  const heaps = usable.map((sample) => sample.heapMB).filter((value) => typeof value === 'number');
  const resources = usable.map((sample) => sample.resources).filter(Boolean);
  const maxOf = (key) =>
    resources.length ? Math.max(...resources.map((item) => item[key] ?? 0)) : null;
  return {
    samples: samples.length,
    rafP50AvgMs: avg('rafP50Ms'),
    rafP95AvgMs: avg('rafP95Ms'),
    longTasksTotal: usable.reduce((sum, sample) => sum + (sample.longTasks ?? 0), 0),
    heapPeakMB: heaps.length ? Math.max(...heaps) : null,
    resourcesPeak: resources.length
      ? { geometries: maxOf('geometries'), textures: maxOf('textures'), programs: maxOf('programs') }
      : null,
    resourcesEnd: resources[resources.length - 1] ?? null,
    errors: samples.reduce((sum, sample) => sum + (sample.errors ?? 0), 0),
  };
}

function machineMatches(base, current) {
  const keys = ['cpu', 'platform', 'arch'];
  return keys.every((key) => base?.[key] === current?.[key]);
}

function thresholdChecks(metrics, baseline) {
  const base = baseline.metrics;
  const checks = [
    {
      name: 'rafP50AvgMs',
      current: metrics.rafP50AvgMs,
      baseline: base.rafP50AvgMs,
      limit: Number((base.rafP50AvgMs * 1.2 + 2).toFixed(3)),
    },
    {
      name: 'rafP95AvgMs',
      current: metrics.rafP95AvgMs,
      baseline: base.rafP95AvgMs,
      limit: Number((base.rafP95AvgMs * 1.25 + 3).toFixed(3)),
    },
    {
      name: 'heapPeakMB',
      current: metrics.heapPeakMB,
      baseline: base.heapPeakMB,
      limit: Number((base.heapPeakMB + 48).toFixed(1)),
    },
  ];
  for (const key of ['geometries', 'textures', 'programs']) {
    const baseValue = base.resourcesPeak?.[key] ?? metrics.resourcesEnd?.[key] ?? 0;
    checks.push({
      name: `resourcesEnd.${key}`,
      current: metrics.resourcesEnd?.[key] ?? 0,
      baseline: baseValue,
      limit: baseValue + 4,
    });
  }
  checks.push({ name: 'errors', current: metrics.errors, baseline: 0, limit: 0 });
  return checks.map((check) => ({ ...check, pass: check.current <= check.limit }));
}

async function stageCycle(page, petUrl, index) {
  await page.evaluate(() => window.__perfNav?.push('/stage?stage=play'));
  await page.waitForTimeout(8000);
  await page.evaluate((url) => window.__perfNav?.push(new URL(url).pathname + new URL(url).search), petUrl);
  await page.waitForTimeout(8000);
  return index;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const machine = machineInfo();
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 480, height: 640 } });
  let pageErrors = 0;
  page.on('pageerror', (error) => {
    pageErrors += 1;
    console.error('[pageerror]', error.message.slice(0, 200));
  });
  await installInstrumentation(page);

  console.log(`打开 ${args.url}`);
  await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitReady(page);
  const petUrl = page.url();

  const totalMs = args.durationMin * 60_000;
  const intervalMs = args.intervalMin * 60_000;
  const startedAt = Date.now();
  const idleEnd = startedAt + totalMs * 0.2;
  const playbackEnd = startedAt + totalMs * 0.4;
  const swapEnd = startedAt + totalMs * 0.7;
  const samples = [];
  const phases = [];

  await sampleFor(page, idleEnd, intervalMs, 'idle', samples);
  phases.push({ phase: 'idle', at: Date.now() - startedAt });

  const playback = await page.evaluate(() => {
    const debug = window.__petDebug;
    if (!debug) return { ok: false, reason: 'no-pet-debug' };
    const sceneId = debug.scenes.find((id) => id.startsWith('gen.')) ?? debug.scenes[0];
    return sceneId ? { ok: debug.playScene(sceneId), sceneId } : { ok: false, reason: 'no-scene' };
  });
  if (!playback.ok) console.warn('[playback] 跳过:', playback.reason ?? 'playScene-false');

  await sampleFor(page, playbackEnd, intervalMs, 'playback', samples);
  phases.push({ phase: 'playback', at: Date.now() - startedAt, sceneId: playback.sceneId ?? null });

  let modelIndex = 0;
  while (Date.now() < swapEnd) {
    modelIndex += 1;
    const nextModel = args.models[modelIndex % args.models.length];
    await page.evaluate((id) => window.__perfSwapModel?.(id), nextModel);
    await sampleFor(page, Math.min(Date.now() + 20_000, swapEnd), 5_000, 'swap', samples);
  }
  phases.push({ phase: 'swap', at: Date.now() - startedAt, swaps: modelIndex });

  const stageMs = Math.max(0, startedAt + totalMs - Date.now());
  const cycles = Math.max(1, Math.min(10, Math.floor(stageMs / 18_000)));
  for (let index = 0; index < cycles && Date.now() < startedAt + totalMs; index += 1) {
    await stageCycle(page, petUrl, index);
    samples.push({ ...(await samplePage(page, 5_000)), phase: 'stage-cycle' });
  }
  await sampleFor(page, startedAt + totalMs, intervalMs, 'stage', samples);
  phases.push({ phase: 'stage', at: Date.now() - startedAt, cycles });

  const metrics = { ...summarize(samples), pageErrors, durationMin: args.durationMin };
  const report = {
    version: 'v4.1',
    at: new Date().toISOString(),
    machine,
    viewport: '480x640',
    models: args.models,
    url: args.url,
    phases,
    metrics,
  };

  if (args.writeBaseline) {
    fs.mkdirSync(path.dirname(args.baseline), { recursive: true });
    fs.writeFileSync(args.baseline, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`基线已写入 ${path.relative(ROOT, args.baseline)}`);
    console.log('指标:', JSON.stringify(metrics));
    await browser.close();
    return;
  }

  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(args.baseline, 'utf-8'));
  } catch {
    await browser.close();
    throw new Error(`基线缺失：${path.relative(ROOT, args.baseline)}；先运行 --write-baseline`);
  }

  const machineOk = machineMatches(baseline.machine, machine);
  if (!machineOk) {
    const message = `硬件指纹不一致：基线 ${baseline.machine?.cpu} / 当前 ${machine.cpu}`;
    if (args.strictMachine) {
      await browser.close();
      throw new Error(message);
    }
    console.warn(`[warn] ${message}（默认只警告；--strict-machine 会失败）`);
  }

  const checks = thresholdChecks(metrics, baseline);
  const failed = checks.filter((check) => !check.pass);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify({ ...report, baseline: args.baseline, machineOk, checks }, null, 2)}\n`);
  console.log(`本次指标: p50 ${metrics.rafP50AvgMs}ms · p95 ${metrics.rafP95AvgMs}ms · 堆峰值 ${metrics.heapPeakMB}MB · 资源 ${JSON.stringify(metrics.resourcesEnd)}`);
  for (const check of checks) {
    console.log(
      `${check.pass ? 'PASS' : 'FAIL'} ${check.name}: 当前 ${check.current} / 基线 ${check.baseline} / 阈值 ${check.limit}`,
    );
  }
  console.log(`报告：${path.relative(ROOT, args.out)}`);
  await browser.close();
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[perf-budget] ${error.message}`);
  process.exitCode = 2;
});
