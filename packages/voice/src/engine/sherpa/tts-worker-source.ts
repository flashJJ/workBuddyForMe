import path from 'node:path';
import { createRequire } from 'node:module';

/**
 * worker 线程入口源码（eval 执行，无需额外文件进 standalone 产物）。
 *
 * 关键点：
 * - 合成是同步原生调用，放在 worker 后主线程（SSE/模型流）不再被推理占住；
 * - 模块入口用主线程解析出的绝对路径 require，绕开 worker 侧的 cwd 差异；
 * - 音频以 Transferable 零拷贝回传，避免大段 PCM 结构化克隆。
 */
export const TTS_WORKER_SOURCE = [
  "const { parentPort, workerData } = require('node:worker_threads');",
  'let tts = null;',
  'try {',
  '  const mod = require(workerData.modulePath);',
  '  tts = new mod.OfflineTts(workerData.config);',
  '  parentPort.postMessage({ type: "ready", sampleRate: tts.sampleRate, numSpeakers: tts.numSpeakers });',
  '} catch (err) {',
  '  parentPort.postMessage({ type: "fatal", message: String((err && err.message) || err) });',
  '}',
  'if (tts) {',
  '  parentPort.on("message", function (msg) {',
  '    if (msg.type === "shutdown") {',
  '      try { if (tts.free) tts.free(); } catch (e) {}',
  '      parentPort.close();',
  '      return;',
  '    }',
  '    if (msg.type !== "synth") return;',
  '    try {',
  '      const out = tts.generate({ text: msg.text, sid: msg.sid, speed: msg.speed });',
  '      const src = out.samples;',
  // 原生缓冲可能是 SharedArrayBuffer/非 transferable，先复制一份再转移
  '      const samples = new Float32Array(src.length);',
  '      samples.set(src);',
  '      parentPort.postMessage({ type: "audio", id: msg.id, samples: samples, sampleRate: out.sampleRate || tts.sampleRate }, [samples.buffer]);',
  '    } catch (err) {',
  '      parentPort.postMessage({ type: "error", id: msg.id, message: String((err && err.message) || err) });',
  '    }',
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
