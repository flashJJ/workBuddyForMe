import { describe, expect, it, vi } from 'vitest';
import { SherpaTtsEngine, type SherpaTtsModule, type SherpaTtsNative } from './tts-engine';
import { VoiceEngineError } from '../types';
import { VOICE_MODELS } from '../../models/manifest';

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

describe('SherpaTtsEngine', () => {
  it('正常构造：映射模型路径/dict/fst，sid=1 透传', async () => {
    const native = makeNative();
    const mod = makeModule(native);
    const engine = await SherpaTtsEngine.create({
      config: { modelDir: '/models/tts', speakerId: 1, speed: 1.2, numThreads: 4 },
      spec: VOICE_MODELS.tts,
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
        spec: VOICE_MODELS.tts,
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
      spec: VOICE_MODELS.tts,
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
      spec: VOICE_MODELS.tts,
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
        spec: VOICE_MODELS.tts,
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
      spec: VOICE_MODELS.tts,
      loader: async () => makeModule(native),
      exists: existsAll,
    });
    await expect(engine.dispose()).resolves.toBeUndefined();
    await expect(engine.dispose()).resolves.toBeUndefined();
  });
});
