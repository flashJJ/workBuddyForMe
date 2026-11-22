import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { WorkerTtsEngine, type TtsWorkerLike } from './tts-worker';
import { getVoiceModelSpec } from '../../models/manifest';

const MELO_SPEC = getVoiceModelSpec('tts', 'melo');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-tts-worker-'));

/** 假 sherpa-onnx-node：记录构造参数，generate 返回可校验的固定 PCM */
const FAKE_MODULE = path.join(tmp, 'fake-sherpa.cjs');
fs.writeFileSync(
  FAKE_MODULE,
  `
class OfflineTts {
  constructor(config) {
    this.config = config;
    this.sampleRate = 24000;
    this.numSpeakers = 3;
  }
  generate({ text, sid, speed }) {
    if (text === 'boom') throw new Error('native failure');
    return { samples: new Float32Array([sid, speed, text.length]), sampleRate: 24000 };
  }
  async generateAsync({ text, sid, speed, onProgress }) {
    if (text === 'boom') throw new Error('native failure');
    onProgress({ samples: new Float32Array([sid]), sampleRate: 24000, progress: 0.5 });
    onProgress({ samples: new Float32Array([speed, text.length]), sampleRate: 24000, progress: 1 });
    return { samples: new Float32Array([sid, speed, text.length]), sampleRate: 24000 };
  }
  free() {}
}
module.exports = { OfflineTts };
`,
  'utf8',
);

/** 仅校验文件存在性的假 exists（配置构造不做磁盘检查） */
const existsAll = () => true;

function makeEngine(config: { modelDir: string; speakerId?: number; speed?: number } = { modelDir: '/models/tts' }) {
  return WorkerTtsEngine.create({
    config,
    spec: MELO_SPEC,
    modulePath: FAKE_MODULE,
    exists: existsAll,
  });
}

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('WorkerTtsEngine（真实 worker 线程 + 假原生模块）', () => {
  it('合成在 worker 内执行：PCM 经 Transferable 回传，sid/speed 透传', async () => {
    const engine = await makeEngine({ modelDir: '/models/tts', speed: 1.5 });
    const result = await engine.synthesize('你好', { speakerId: 2 });
    expect(Array.from(result.samples)).toEqual([2, 1.5, 2]);
    expect(result.sampleRate).toBe(24000);

    const faster = await engine.synthesize('快一点', { speakerId: 2, speed: 0.8 });
    const fasterSamples = Array.from(faster.samples);
    expect(fasterSamples[0]).toBe(2);
    expect(fasterSamples[1]).toBeCloseTo(0.8);
    expect(fasterSamples[2]).toBe(3);
    await engine.dispose();
  });

  it('synthesizeStream：增量块按序回调，返回值等于块拼接', async () => {
    const engine = await makeEngine();
    const chunks: number[][] = [];
    const result = await engine.synthesizeStream('你好', { speakerId: 2 }, (chunk) => {
      chunks.push(Array.from(chunk.samples));
    });
    expect(chunks).toEqual([[2], [1, 2]]);
    expect(Array.from(result.samples)).toEqual([2, 1, 2]);
    await engine.dispose();
  });

  it('越界 sid 回落引擎默认（0），纯标点不进 worker', async () => {
    const engine = await makeEngine();
    const out = await engine.synthesize('你好', { speakerId: 999 });
    expect(Array.from(out.samples)).toEqual([0, 1, 2]);

    const punctuated = await engine.synthesize('：）');
    expect(punctuated.samples.length).toBe(0);
    await engine.dispose();
  });

  it('原生异常转为 VoiceEngineError，后续调用仍可用', async () => {
    const engine = await makeEngine();
    await expect(engine.synthesize('boom')).rejects.toMatchObject({ name: 'VoiceEngineError' });
    await expect(engine.synthesize('正常')).resolves.toBeDefined();
    await engine.dispose();
  });

  it('dispose 幂等；释放后合成报错', async () => {
    const engine = await makeEngine();
    await expect(engine.dispose()).resolves.toBeUndefined();
    await expect(engine.dispose()).resolves.toBeUndefined();
    await expect(engine.synthesize('你好')).rejects.toMatchObject({ name: 'VoiceEngineError' });
  });

  it('原生模块入口不存在：初始化失败而不是挂死', async () => {
    await expect(
      WorkerTtsEngine.create({
        config: { modelDir: '/models/tts' },
        spec: MELO_SPEC,
        modulePath: path.join(tmp, 'missing-sherpa.cjs'),
        exists: existsAll,
      }),
    ).rejects.toMatchObject({ name: 'VoiceEngineError' });
  });

  it('就绪握手超时：终止 worker 并报错，不留下仍在加载模型的常驻线程', async () => {
    vi.useFakeTimers();
    try {
      const terminate = vi.fn(async () => 0);
      const fakeWorker = {
        on: vi.fn(),
        postMessage: vi.fn(),
        terminate,
        unref: vi.fn(),
      } as unknown as TtsWorkerLike;

      const pending = WorkerTtsEngine.create({
        config: { modelDir: '/models/tts' },
        spec: MELO_SPEC,
        modulePath: '/fake/sherpa.cjs',
        exists: existsAll,
        workerFactory: () => fakeWorker,
      });
      const expectation = expect(pending).rejects.toMatchObject({ name: 'VoiceEngineError' });
      await vi.advanceTimersByTimeAsync(30_000);
      await expectation;
      expect(terminate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
