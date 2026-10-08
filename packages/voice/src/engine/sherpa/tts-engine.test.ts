import { describe, expect, it, vi } from 'vitest';
import { SherpaTtsEngine, type SherpaTtsModule, type SherpaTtsNative } from './tts-engine';
import { VoiceEngineError } from '../types';
import { getVoiceModelSpec } from '../../models/manifest';

const MELO_SPEC = getVoiceModelSpec('tts', 'melo');
const KOKORO_SPEC = getVoiceModelSpec('tts', 'kokoro');

function makeNative(overrides: Partial<SherpaTtsNative> = {}): SherpaTtsNative {
  return {
    sampleRate: 44100,
    numSpeakers: 2,
    generate: vi.fn(() => ({ samples: new Float32Array([0.1, 0.2]), sampleRate: 44100 })),
    free: vi.fn(),
    ...overrides,
  };
}

function makeModule(native: SherpaTtsNative): SherpaTtsModule {
  return { OfflineTts: vi.fn(() => native) as unknown as SherpaTtsModule['OfflineTts'] };
}

const existsAll = () => true;

describe('SherpaTtsEngine（MeloTTS VITS 单说话人）', () => {
  it('正常构造：映射模型路径/dict/fst，sid=1 透传', async () => {
    const native = makeNative();
    const mod = makeModule(native);
    const engine = await SherpaTtsEngine.create({
      config: { modelDir: '/models/tts', speakerId: 1, speed: 1.2, numThreads: 4 },
      spec: MELO_SPEC,
      loader: async () => mod,
      exists: existsAll,
    });
    const result = await engine.synthesize('你好');
    expect(result.sampleRate).toBe(44100);
    expect(result.samples.length).toBe(2);
    expect(native.generate).toHaveBeenCalledWith({ text: '你好', sid: 1, speed: 1.2 });
    expect(mod.OfflineTts).toHaveBeenCalledTimes(1);
    const cfg = (mod.OfflineTts as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      model: { vits: { model: string; dictDir: string }; numThreads: number };
      ruleFsts: string;
    };
    expect(cfg.model.vits.model.replaceAll('\\', '/')).toBe('/models/tts/model.onnx');
    expect(cfg.model.vits.dictDir.replaceAll('\\', '/')).toBe('/models/tts/dict');
    expect(cfg.ruleFsts).toContain('number.fst');
    expect(cfg.ruleFsts).toContain('new_heteronym.fst');
  });

  it('模型文件缺失抛 VoiceEngineError 且带下载引导 hint', async () => {
    await expect(
      SherpaTtsEngine.create({
        config: { modelDir: '/models/tts' },
        spec: MELO_SPEC,
        loader: async () => makeModule(makeNative()),
        exists: (p) => !p.includes('tokens.txt'),
      }),
    ).rejects.toMatchObject({ name: 'VoiceEngineError', engine: 'tts' });
  });

  it('单 speaker 模型：请求 sid=1 自动回落 0 并警告', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const native = makeNative({ numSpeakers: 1 });
    const engine = await SherpaTtsEngine.create({
      config: { modelDir: '/models/tts', speakerId: 1 },
      spec: MELO_SPEC,
      loader: async () => makeModule(native),
      exists: existsAll,
    });
    await engine.synthesize('x');
    expect(native.generate).toHaveBeenCalledWith(expect.objectContaining({ sid: 0 }));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('空文本返回零长度 PCM 且不调用原生合成', async () => {
    const native = makeNative();
    const engine = await SherpaTtsEngine.create({
      config: { modelDir: '/models/tts', speakerId: 0 },
      spec: MELO_SPEC,
      loader: async () => makeModule(native),
      exists: existsAll,
    });
    const r = await engine.synthesize('   ');
    expect(r.samples.length).toBe(0);
    expect(native.generate).not.toHaveBeenCalled();
  });

  it('原生模块加载失败包装为 VoiceEngineError', async () => {
    await expect(
      SherpaTtsEngine.create({
        config: { modelDir: '/models/tts' },
        spec: MELO_SPEC,
        loader: async () => {
          throw new Error('cannot find .node');
        },
        exists: existsAll,
      }),
    ).rejects.toBeInstanceOf(VoiceEngineError);
  });

  it('dispose 幂等且吞掉 native free 异常', async () => {
    const native = makeNative({ free: vi.fn(() => {
      throw new Error('boom');
    }) });
    const engine = await SherpaTtsEngine.create({
      config: { modelDir: '/models/tts', speakerId: 0 },
      spec: MELO_SPEC,
      loader: async () => makeModule(native),
      exists: existsAll,
    });
    await expect(engine.dispose()).resolves.toBeUndefined();
    await expect(engine.dispose()).resolves.toBeUndefined();
  });
});

describe('SherpaTtsEngine（Kokoro 多说话人）', () => {
  const kokoroConfig = {
    modelDir: '/models/tts',
    speakerId: 3,
    speed: 1,
    numThreads: 4,
    kokoro: {
      voices: '/models/tts/voices.bin',
      dataDir: '/models/tts/espeak-ng-data',
      lexicon: '/models/tts/lexicon-us-en.txt,/models/tts/lexicon-zh.txt',
    },
  };

  it('构造走 kokoro 配置：voices/espeak/lexicon 透传，maxNumSentences=1，中文 fst 拼接', async () => {
    const native = makeNative({ numSpeakers: 103 });
    const mod = makeModule(native);
    const engine = await SherpaTtsEngine.create({
      config: kokoroConfig,
      spec: KOKORO_SPEC,
      loader: async () => mod,
      exists: existsAll,
    });
    await engine.synthesize('你好');
    expect(native.generate).toHaveBeenCalledWith({ text: '你好', sid: 3, speed: 1 });
    const cfg = (mod.OfflineTts as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      model: {
        kokoro: { model: string; voices: string; tokens: string; dataDir: string; lexicon: string };
      };
      maxNumSentences: number;
      ruleFsts: string;
    };
    expect(cfg.model.kokoro.model.replaceAll('\\', '/')).toBe('/models/tts/model.onnx');
    expect(cfg.model.kokoro.voices.replaceAll('\\', '/')).toBe('/models/tts/voices.bin');
    expect(cfg.model.kokoro.dataDir.replaceAll('\\', '/')).toBe('/models/tts/espeak-ng-data');
    expect(cfg.model.kokoro.lexicon).toContain('lexicon-zh.txt');
    expect(cfg.maxNumSentences).toBe(1);
    expect(cfg.ruleFsts).toContain('date-zh.fst');
    expect(cfg.ruleFsts).toContain('number-zh.fst');
    expect(cfg.ruleFsts).toContain('phone-zh.fst');
  });

  it('必需文件缺失（voices.bin / espeak phontab / lexicon-zh）抛 VoiceEngineError', async () => {
    for (const missing of ['voices.bin', 'phontab', 'lexicon-zh.txt']) {
      await expect(
        SherpaTtsEngine.create({
          config: kokoroConfig,
          spec: KOKORO_SPEC,
          loader: async () => makeModule(makeNative({ numSpeakers: 103 })),
          exists: (p) => !p.includes(missing),
        }),
      ).rejects.toMatchObject({ name: 'VoiceEngineError', engine: 'tts' });
    }
  });

  it('逐句 sid：按角色切换音色；越界 sid 回落引擎默认（不抛错）', async () => {
    const native = makeNative({ numSpeakers: 103 });
    const engine = await SherpaTtsEngine.create({
      config: kokoroConfig,
      spec: KOKORO_SPEC,
      loader: async () => makeModule(native),
      exists: existsAll,
    });
    await engine.synthesize('马克', { speakerId: 58 });
    expect(native.generate).toHaveBeenLastCalledWith({ text: '马克', sid: 58, speed: 1 });
    await engine.synthesize('晴');
    expect(native.generate).toHaveBeenLastCalledWith({ text: '晴', sid: 3, speed: 1 });
    await engine.synthesize('越界', { speakerId: 999 });
    expect(native.generate).toHaveBeenLastCalledWith({ text: '越界', sid: 3, speed: 1 });
  });
});
