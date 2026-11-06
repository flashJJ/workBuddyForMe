import { describe, expect, it, vi } from 'vitest';
import { createSherpaTtsEngine } from './create-tts-engine';
import { buildNativeTtsConfig } from './tts-native-config';
import type { SherpaTtsModule, SherpaTtsNative } from './tts-engine';
import { getVoiceModelSpec } from '../../models/manifest';

const MELO_SPEC = getVoiceModelSpec('tts', 'melo');

function makeModule(): SherpaTtsModule {
  const native: SherpaTtsNative = {
    sampleRate: 44100,
    numSpeakers: 2,
    generate: vi.fn(() => ({ samples: new Float32Array([0.5]), sampleRate: 44100 })),
    free: vi.fn(),
  };
  return { OfflineTts: vi.fn(() => native) as unknown as SherpaTtsModule['OfflineTts'] };
}

const existsAll = () => true;

describe('createSherpaTtsEngine（worker 优先 + inline 回退）', () => {
  it('未解析到模块入口：回退 inline 并正常合成', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const engine = await createSherpaTtsEngine({
      config: { modelDir: '/models/tts' },
      spec: MELO_SPEC,
      modulePath: null,
      loader: async () => makeModule(),
      exists: existsAll,
    });
    const result = await engine.synthesize('你好');
    expect(result.samples.length).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('worker 初始化失败：回退 inline，朗读仍可用', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const engine = await createSherpaTtsEngine({
      config: { modelDir: '/models/tts' },
      spec: MELO_SPEC,
      modulePath: '/definitely/missing/sherpa-onnx.js',
      loader: async () => makeModule(),
      exists: existsAll,
    });
    await expect(engine.synthesize('你好')).resolves.toBeDefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("mode='inline'：不解析模块入口，直接构造主线程引擎", async () => {
    const loader = vi.fn(async () => makeModule());
    const engine = await createSherpaTtsEngine({
      config: { modelDir: '/models/tts' },
      spec: MELO_SPEC,
      mode: 'inline',
      modulePath: null,
      loader,
      exists: existsAll,
    });
    await engine.synthesize('你好');
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe('buildNativeTtsConfig', () => {
  it('melo：VITS 模型路径 + dict + FST 全量拼接，maxNumSentences=2', () => {
    const built = buildNativeTtsConfig({
      config: { modelDir: '/models/tts', speakerId: 0, numThreads: 2 },
      spec: MELO_SPEC,
      exists: existsAll,
    });
    const cfg = built.nativeConfig as {
      model: { vits: { model: string; dictDir: string } };
      numThreads: number;
      maxNumSentences: number;
      ruleFsts: string;
    };
    expect(built.isKokoro).toBe(false);
    expect(cfg.model.vits.model.replaceAll('\\', '/')).toBe('/models/tts/model.onnx');
    expect(cfg.model.vits.dictDir.replaceAll('\\', '/')).toBe('/models/tts/dict');
    expect(cfg.numThreads).toBe(2);
    expect(cfg.maxNumSentences).toBe(2);
    expect(cfg.ruleFsts).toContain('new_heteronym.fst');
  });

  it('配置是纯 JSON：可直接结构化克隆进 worker', () => {
    const built = buildNativeTtsConfig({
      config: { modelDir: '/models/tts' },
      spec: MELO_SPEC,
      exists: existsAll,
    });
    expect(() => structuredClone(built.nativeConfig)).not.toThrow();
  });
});
