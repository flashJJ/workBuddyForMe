/**
 * 桌宠 4h 长稳采样（T0.9）：与 T1.9 同口径。
 *
 * 每 5 分钟采样 10s：rAF 回调耗时（avg/p50/p95/max）、长任务、WebGL clear 次数、
 * JS 堆、DOM 节点数与 GPU 资源计数；结果逐行追加到 JSONL，结束时打印汇总。
 * `--summary-out <path>` 额外写一份含汇总与采样的 JSON，供版本归档引用。
 * 页面必须已开启剧本引擎
 * （`WBFM_PET_SCRIPT=1` 启动的 dev server 或对应构建），否则直接报错退出。
 *
 * 用法：
 *   node scripts/perf/pet-longrun.mjs --url http://127.0.0.1:3003/pet?model=vrm%3Abuiltin%3Axuetuan
 *   node scripts/perf/pet-longrun.mjs --duration-min 10 --interval-min 1 --sample-ms 5000
 *   node scripts/perf/pet-longrun.mjs --summary-out .tmp/longrun-summary.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs(argv) {
  const args = {
    url: 'http://127.0.0.1:42337/pet?model=vrm%3Abuiltin%3Axuetuan',
    out: path.join(ROOT, '.tmp', 't09-longrun.jsonl'),
    durationMin: 240,
    intervalMin: 5,
    sampleMs: 10_000,
    summaryOut: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') args.url = argv[(i += 1)];
    else if (arg === '--out') args.out = path.resolve(argv[(i += 1)]);
    else if (arg === '--duration-min') args.durationMin = Number(argv[(i += 1)]);
    else if (arg === '--interval-min') args.intervalMin = Number(argv[(i += 1)]);
    else if (arg === '--sample-ms') args.sampleMs = Number(argv[(i += 1)]);
    else if (arg === '--summary-out') args.summaryOut = path.resolve(argv[(i += 1)]);
    else if (arg.startsWith('--')) throw new Error(`未知参数: ${arg}`);
  }
  return args;
}

/** 页面内采样：统计应用自身 rAF 回调耗时、GL 调用与内存/DOM */
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
      rafAvgMs: Number(
        (sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length)).toFixed(3),
      ),
      rafP50Ms: Number(at(0.5).toFixed(3)),
      rafP95Ms: Number(at(0.95).toFixed(3)),
      rafMaxMs: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
      longTasks: longTasks.length,
      longTaskMaxMs: Number((Math.max(0, ...longTasks)).toFixed(3)),
      resources: window.__vrmDebug?.resources?.() ?? null,
      glClears: window.__perfGlClears ?? 0,
      glDraws: window.__perfGlDraws ?? 0,
      heapMB: memory ? Number((memory.usedJSHeapSize / 1024 / 1024).toFixed(1)) : null,
      domNodes: document.getElementsByTagName('*').length,
      errors: window.__perfErrors ?? 0,
    };
  }, sampleMs);
}

function percentile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
}

function summarize(samples, startedAt) {
  const fps = samples.map((sample) => sample.fps);
  const rafP50 = samples.map((sample) => sample.rafP50Ms);
  const rafP95 = samples.map((sample) => sample.rafP95Ms);
  const heaps = samples.map((sample) => sample.heapMB).filter((value) => value !== null);
  const resources = samples.map((sample) => sample.resources).filter(Boolean);
  const maxOf = (key) =>
    resources.length ? Math.max(...resources.map((item) => item[key] ?? 0)) : null;
  return {
    minutes: Number(((Date.now() - startedAt) / 60_000).toFixed(1)),
    samples: samples.length,
    renderer: 'swiftshader',
    fpsMin: Math.min(...fps),
    fpsMax: Math.max(...fps),
    rafP50AvgMs: Number((rafP50.reduce((sum, value) => sum + value, 0) / Math.max(1, rafP50.length)).toFixed(3)),
    rafP95AvgMs: Number((rafP95.reduce((sum, value) => sum + value, 0) / Math.max(1, rafP95.length)).toFixed(3)),
    rafP95MaxMs: Math.max(...rafP95),
    longTasksTotal: samples.reduce((sum, sample) => sum + (sample.longTasks ?? 0), 0),
    longTaskMaxMs: Math.max(0, ...samples.map((sample) => sample.longTaskMaxMs ?? 0)),
    heapStartMB: heaps[0] ?? null,
    heapEndMB: heaps[heaps.length - 1] ?? null,
    heapPeakMB: heaps.length ? Math.max(...heaps) : null,
    resourcesPeak: resources.length
      ? { geometries: maxOf('geometries'), textures: maxOf('textures'), programs: maxOf('programs') }
      : null,
    resourcesEnd: resources[resources.length - 1] ?? null,
    errors: samples.reduce((sum, sample) => sum + sample.errors, 0),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, '');

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
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('[console.error]', message.text().slice(0, 200));
  });

  await page.addInitScript(() => {
    const noop = () => {};
    window.__perfGlClears = 0;
    window.__perfGlDraws = 0;
    window.__perfErrors = 0;
    window.__perfRafDurations = [];
    window.__perfLongTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__perfLongTasks.push(entry.duration);
          if (window.__perfLongTasks.length > 4000) window.__perfLongTasks.splice(0, 1000);
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      // 浏览器不支持 longtask 时保持空数组
    }
    window.addEventListener('error', () => {
      window.__perfErrors += 1;
    });
    // 统计应用自身 rAF 回调耗时（采样循环自己的 rAF 不经过这里）
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
      },
    };
    // 统计 WebGL clear / draw 调用，判断画面是否真在更新
    for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
      const proto = window[name]?.prototype;
      if (!proto) continue;
      for (const method of ['clear', 'drawElements', 'drawArrays']) {
        const original = proto[method];
        if (typeof original !== 'function') continue;
        proto[method] = function patched(...callArgs) {
          if (method === 'clear') window.__perfGlClears += 1;
          else window.__perfGlDraws += 1;
          return original.apply(this, callArgs);
        };
      }
    }
  });

  console.log(`打开 ${args.url}`);
  await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(
    () => Boolean(window.__vrmDebug?.vrm?.humanoid) || Boolean(window.__petDebug),
    null,
    { timeout: 180_000 },
  );
  const scriptReady = await page.evaluate(() => Boolean(window.__petDebug));
  if (!scriptReady) {
    await browser.close();
    throw new Error('页面没有 __petDebug：请用 WBFM_PET_SCRIPT=1 启动 dev server 或构建后再跑');
  }
  console.log('页面就绪，开始采样（每 ' + args.intervalMin + ' 分钟一次）');

  const startedAt = Date.now();
  const samples = [];
  let nextSampleAt = 0;
  while (Date.now() - startedAt < args.durationMin * 60_000) {
    const waitMs = nextSampleAt - (Date.now() - startedAt);
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    try {
      const sample = await samplePage(page, args.sampleMs);
      const entry = {
        at: new Date().toISOString(),
        minute: Number(((Date.now() - startedAt) / 60_000).toFixed(1)),
        ...sample,
      };
      samples.push(entry);
      fs.appendFileSync(args.out, `${JSON.stringify(entry)}\n`);
      console.log(
        `[${entry.minute}m] ${entry.fps}fps · rAF p95 ${entry.rafP95Ms}ms · clear ${entry.glClears} · draw ${entry.glDraws} · heap ${entry.heapMB}MB · dom ${entry.domNodes}`,
      );
    } catch (error) {
      console.error('[sample] 失败:', error.message.slice(0, 200));
    }
    nextSampleAt += args.intervalMin * 60_000;
  }

  const summary = { ...summarize(samples, startedAt), pageErrors, url: args.url };
  fs.appendFileSync(args.out, `${JSON.stringify({ summary })}\n`);
  if (args.summaryOut) {
    fs.mkdirSync(path.dirname(args.summaryOut), { recursive: true });
    fs.writeFileSync(
      args.summaryOut,
      `${JSON.stringify({ version: 'v4.1', at: new Date().toISOString(), args, summary, samples }, null, 2)}\n`,
    );
    console.log(`汇总报告: ${path.relative(ROOT, args.summaryOut)}`);
  }
  console.log('汇总:', JSON.stringify(summary));
  console.log(`原始数据: ${path.relative(ROOT, args.out)}`);
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
