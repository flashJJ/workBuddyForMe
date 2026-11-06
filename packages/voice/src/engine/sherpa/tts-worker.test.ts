import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WorkerTtsEngine } from './tts-worker';
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
});
