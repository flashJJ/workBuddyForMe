import { describe, expect, it, vi } from 'vitest';
import { SherpaAsrEngine, type SherpaAsrModule, type SherpaAsrRecognizer } from './asr-engine';
import { VoiceEngineError } from '../types';
import { VOICE_MODELS } from '../../models/manifest';

function makeRecognizer(text: string, lang = '<|zh|>'): SherpaAsrRecognizer {
  const stream = {
    acceptWaveform: vi.fn(),
  };
  return {
    createStream: vi.fn(() => stream),
    decode: vi.fn(),
    getResult: vi.fn(() => ({ text, lang })),
    free: vi.fn(),
  };
}

function makeModule(recognizer: SherpaAsrRecognizer): SherpaAsrModule {
  return {
    OfflineRecognizer: vi.fn(() => recognizer) as unknown as SherpaAsrModule['OfflineRecognizer'],
  };
}

const existsAll = () => true;

describe('SherpaAsrEngine', () => {
  it('正常识别：喂入 16k PCM，返回 trim 文本与归一化语言码', async () => {
    const recognizer = makeRecognizer('  你好世界  ', '<|zh|>');
    const mod = makeModule(recognizer);
    const engine = await SherpaAsrEngine.create({
      config: { modelDir: '/models/asr', numThreads: 2 },
      spec: VOICE_MODELS.asr,
      loader: async () => mod,
      exists: existsAll,
    });
    const result = await engine.transcribe(new Float32Array(1600));
    expect(result).toEqual({ text: '你好世界', lang: 'zh' });

    const stream = (recognizer.createStream as ReturnType<typeof vi.fn>).mock.results[0]!.value;
    expect(stream.acceptWaveform).toHaveBeenCalledWith(
      expect.objectContaining({ sampleRate: 16000 }),
    );
    expect(recognizer.decode).toHaveBeenCalled();
    const cfg = (mod.OfflineRecognizer as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      modelConfig: {
        senseVoice: { model: string; useInverseTextNormalization: number };
        tokens: string;
        numThreads: number;
      };
    };
    expect(cfg.modelConfig.senseVoice.model.replaceAll('\\', '/')).toContain(
      'model.int8.onnx',
    );
    expect(cfg.modelConfig.numThreads).toBe(2);
    expect(cfg.modelConfig.senseVoice.useInverseTextNormalization).toBe(1);
  });

  it('空 PCM 直接返回空文本，不创建 stream', async () => {
    const recognizer = makeRecognizer('不应出现');
    const engine = await SherpaAsrEngine.create({
      config: { modelDir: '/models/asr' },
      spec: VOICE_MODELS.asr,
      loader: async () => makeModule(recognizer),
      exists: existsAll,
    });
    expect(await engine.transcribe(new Float32Array(0))).toEqual({ text: '', lang: null });
    expect(recognizer.createStream).not.toHaveBeenCalled();
  });

  it('useItn=false 时关闭逆文本归一化', async () => {
    const mod = makeModule(makeRecognizer('x'));
    await SherpaAsrEngine.create({
      config: { modelDir: '/models/asr' },
      spec: VOICE_MODELS.asr,
      useItn: false,
      loader: async () => mod,
      exists: existsAll,
    });
    const cfg = (mod.OfflineRecognizer as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      modelConfig: { senseVoice: { useInverseTextNormalization: number } };
    };
    expect(cfg.modelConfig.senseVoice.useInverseTextNormalization).toBe(0);
  });

  it('模型缺失抛 VoiceEngineError(asr) 带 hint', async () => {
    await expect(
      SherpaAsrEngine.create({
        config: { modelDir: '/models/asr' },
        spec: VOICE_MODELS.asr,
        loader: async () => makeModule(makeRecognizer('x')),
        exists: (p) => !p.includes('tokens.txt'),
      }),
    ).rejects.toMatchObject({ name: 'VoiceEngineError', engine: 'asr' });
  });

  it('无语言标签时 lang 安全回落为 null', async () => {
    const recognizer = makeRecognizer('嗯', '');
    const engine = await SherpaAsrEngine.create({
      config: { modelDir: '/models/asr' },
      spec: VOICE_MODELS.asr,
      loader: async () => makeModule(recognizer),
      exists: existsAll,
    });
    expect((await engine.transcribe(new Float32Array(160))).lang).toBeNull();
  });

  it('原生模块加载失败包装为 VoiceEngineError', async () => {
    await expect(
      SherpaAsrEngine.create({
        config: { modelDir: '/models/asr' },
        spec: VOICE_MODELS.asr,
        loader: async () => {
          throw new Error('dlopen fail');
        },
        exists: existsAll,
      }),
    ).rejects.toBeInstanceOf(VoiceEngineError);
  });

  it('dispose 幂等且吞异常', async () => {
    const recognizer = makeRecognizer('x');
    recognizer.free = vi.fn(() => {
      throw new Error('boom');
    });
    const engine = await SherpaAsrEngine.create({
      config: { modelDir: '/models/asr' },
      spec: VOICE_MODELS.asr,
      loader: async () => makeModule(recognizer),
      exists: existsAll,
    });
    await expect(engine.dispose()).resolves.toBeUndefined();
    await expect(engine.dispose()).resolves.toBeUndefined();
  });
});
