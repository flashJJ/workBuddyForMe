import path from 'node:path';
import { createRequire } from 'node:module';

/**
 * worker 线程入口源码（eval 执行，无需额外文件进 standalone 产物）。
 *
 * 关键点：
 * - 合成放在 worker 后主线程（SSE/模型流）不再被推理占住；
 * - 支持 generateAsync 增量回传：每收到一块 PCM 立即 postMessage（Transferable
 *   零拷贝），首块音频不再等整句合成完；
 * - 合成按消息顺序串行执行（同一个 OfflineTts 实例不可并发调用）；
 * - abort 消息在块边界生效（onProgress 返回 0），避免停轮后旧任务长期占用 worker。
 */
export const TTS_WORKER_SOURCE = [
  "const { parentPort, workerData } = require('node:worker_threads');",
  'let tts = null;',
  'const cancelled = new Set();',
  'let chain = Promise.resolve();',
  'try {',
  '  const mod = require(workerData.modulePath);',
  '  tts = new mod.OfflineTts(workerData.config);',
  '  parentPort.postMessage({ type: "ready", sampleRate: tts.sampleRate, numSpeakers: tts.numSpeakers });',
  '} catch (err) {',
  '  parentPort.postMessage({ type: "fatal", message: String((err && err.message) || err) });',
  '}',
  'async function synthOne(msg) {',
  '  const id = msg.id;',
  '  let emitted = 0;',
  '  try {',
  '    const onProgress = function (info) {',
  '      if (cancelled.has(id)) return 0;',
  '      const src = info.samples;',
  "      const samples = new Float32Array(src.length);",
  '      samples.set(src);',
  '      emitted += samples.length;',
  '      parentPort.postMessage({ type: "audio_chunk", id: id, samples: samples, sampleRate: info.sampleRate || tts.sampleRate, progress: info.progress }, [samples.buffer]);',
  '      return 1;',
  '    };',
  '    let out;',
  '    if (typeof tts.generateAsync === "function") {',
  '      out = await tts.generateAsync({ text: msg.text, sid: msg.sid, speed: msg.speed, onProgress: onProgress });',
  '    } else {',
  '      out = tts.generate({ text: msg.text, sid: msg.sid, speed: msg.speed });',
  '      onProgress({ samples: out.samples, sampleRate: out.sampleRate, progress: 1 });',
  '    }',
  '    if (cancelled.has(id)) return;',
  '    const total = out.samples.length;',
  '    const tail = emitted < total ? out.samples.slice(emitted) : new Float32Array(0);',
  '    const copy = new Float32Array(tail.length);',
  '    copy.set(tail);',
  '    parentPort.postMessage({ type: "audio_done", id: id, samples: copy, sampleRate: out.sampleRate || tts.sampleRate }, [copy.buffer]);',
  '  } catch (err) {',
  '    parentPort.postMessage({ type: "error", id: id, message: String((err && err.message) || err) });',
  '  } finally {',
  '    cancelled.delete(id);',
  '  }',
  '}',
  'if (tts) {',
  '  parentPort.on("message", function (msg) {',
  '    if (msg.type === "shutdown") {',
  '      try { if (tts.free) tts.free(); } catch (e) {}',
  '      parentPort.close();',
  '      return;',
  '    }',
  '    if (msg.type === "abort") { cancelled.add(msg.id); return; }',
  '    if (msg.type !== "synth") return;',
  '    chain = chain.then(function () { return synthOne(msg); }).catch(function () {});',
  '  });',
  '}',
].join('\n');

/**
 * 解析 sherpa-onnx-node 的绝对入口，供 worker 内 require。
 *
 * 以服务端入口脚本（standalone 的 server.js / next dev 的进程入口）为解析基点，
 * 逐级向上能找到 resources/server/node_modules 或仓库根 node_modules；
 * 都失败时返回 null，由调用方回退主线程引擎。
 */
export function resolveSherpaModulePath(): string | null {
  const bases = [process.argv[1], path.join(process.cwd(), 'index.js')].filter(
    (p): p is string => Boolean(p),
  );
  for (const base of bases) {
    try {
      return createRequire(base).resolve('sherpa-onnx-node');
    } catch {
      /* 试下一个基点 */
    }
  }
  return null;
}
