import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VOICE_SETTINGS } from '@wbfm/shared/schemas';
import type { DatabaseInstance, SettingsRepository } from '@wbfm/database';

// 只替换引擎工厂（避免在单测里真实加载 325MB 模型），其余 @wbfm/voice 导出保持真实
const h = vi.hoisted(() => ({
  create: vi.fn(),
  synth: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('@wbfm/voice', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wbfm/voice')>()),
  SherpaTtsEngine: { create: h.create },
}));

import { VoiceRuntime } from './voice-runtime';

function makeRuntime(avatarModelId = 'mark', ttsModel: 'melo' | 'kokoro' = 'kokoro') {
  const settings = {
    ...DEFAULT_VOICE_SETTINGS,
    avatarModelId,
    ttsModel,
    modelsDir: '/tmp/wbfm-voice-runtime-test',
  };
  const settingsRepo = {
    getJson: vi.fn(() => settings),
  } as unknown as SettingsRepository;
  const runtime = new VoiceRuntime({} as DatabaseInstance, settingsRepo);
  return { runtime, settings };
}

describe('VoiceRuntime 角色声线解析', () => {
  beforeEach(() => {
    h.create.mockReset();
    h.synth.mockReset();
    h.dispose.mockReset();
    h.create.mockResolvedValue({ synthesize: h.synth, dispose: h.dispose });
    h.synth.mockResolvedValue({ samples: new Float32Array([0.1]), sampleRate: 24000 });
  });

  it('未显式传 sid：按当前 avatarModelId 的绑定声线合成（Mark → 58）', async () => {
    const { runtime } = makeRuntime('mark');
    await runtime.synthesize('你好，我是马克。');
    expect(h.synth).toHaveBeenCalledWith('你好，我是马克。', { speakerId: 58 });
  });

  it('切换角色后按新绑定合成（Mao → 32，Haru → 3）', async () => {
    const { runtime: mao } = makeRuntime('mao');
    await mao.synthesize('魔法时间');
    expect(h.synth).toHaveBeenLastCalledWith('魔法时间', { speakerId: 32 });

    const { runtime: haru } = makeRuntime('haru');
    await haru.synthesize('你好');
    expect(h.synth).toHaveBeenLastCalledWith('你好', { speakerId: 3 });
  });

  it('调用方显式 sid（请求 voice.speakerId / 试听）优先于角色绑定', async () => {
    const { runtime } = makeRuntime('mark');
    await runtime.synthesize('试听', 18);
    expect(h.synth).toHaveBeenCalledWith('试听', { speakerId: 18 });
  });

  it('引擎以 Kokoro 配置长驻创建（voices/espeak/双词典/中文 fst），且只创建一次', async () => {
    const { runtime } = makeRuntime('haru');
    await runtime.synthesize('第一句');
    await runtime.synthesize('第二句');
    expect(h.create).toHaveBeenCalledTimes(1);
    const opts = h.create.mock.calls[0]![0] as {
      config: {
        modelDir: string;
        speakerId: number;
        kokoro: { voices: string; dataDir: string; lexicon: string; ruleFsts: string };
      };
    };
    expect(opts.config.modelDir.replaceAll('\\', '/')).toContain('kokoro-multi-lang-v1_1');
    expect(opts.config.speakerId).toBe(DEFAULT_VOICE_SETTINGS.ttsSpeakerId);
    expect(opts.config.kokoro.voices.replaceAll('\\', '/')).toMatch(/kokoro-multi-lang-v1_1\/voices\.bin$/);
    expect(opts.config.kokoro.dataDir.replaceAll('\\', '/')).toMatch(/espeak-ng-data$/);
    expect(opts.config.kokoro.lexicon).toContain('lexicon-us-en.txt');
    expect(opts.config.kokoro.lexicon).toContain('lexicon-zh.txt');
    expect(opts.config.kokoro.ruleFsts).toContain('date-zh.fst');
    expect(opts.config.kokoro.ruleFsts).toContain('phone-zh.fst');
  });
});

describe('VoiceRuntime MeloTTS 单声引擎', () => {
  beforeEach(() => {
    h.create.mockReset();
    h.synth.mockReset();
    h.dispose.mockReset();
    h.create.mockResolvedValue({ synthesize: h.synth, dispose: h.dispose });
    h.synth.mockResolvedValue({ samples: new Float32Array([0.1]), sampleRate: 44100 });
  });

  it('ttsModel=melo：以 VITS 配置创建（无 kokoro 段，speakerId=0），只创建一次', async () => {
    const { runtime } = makeRuntime('haru', 'melo');
    await runtime.synthesize('第一句');
    await runtime.synthesize('第二句');
    expect(h.create).toHaveBeenCalledTimes(1);
    const opts = h.create.mock.calls[0]![0] as {
      spec: { id: string };
      config: { modelDir: string; speakerId: number; kokoro?: unknown };
    };
    expect(opts.spec.id).toBe('vits-melo-tts-zh_en');
    expect(opts.config.modelDir.replaceAll('\\', '/')).toContain('vits-melo-tts-zh_en');
    expect(opts.config.kokoro).toBeUndefined();
    expect(opts.config.speakerId).toBe(0);
  });

  it('MeloTTS 单说话人：调用方显式 sid 也强制为 0（角色绑定不生效）', async () => {
    const { runtime } = makeRuntime('mark', 'melo');
    await runtime.synthesize('你好，我是马克。', 58);
    expect(h.synth).toHaveBeenCalledWith('你好，我是马克。', { speakerId: 0 });
  });

  it('切换 ttsModel 并 invalidate 后：dispose 旧引擎并按新模型重建', async () => {
    const { runtime, settings } = makeRuntime('haru', 'kokoro');
    await runtime.synthesize('kokoro 句');
    expect(h.create).toHaveBeenCalledTimes(1);

    settings.ttsModel = 'melo';
    runtime.invalidateTts();
    await runtime.synthesize('melo 句');

    expect(h.dispose).toHaveBeenCalledTimes(1);
    expect(h.create).toHaveBeenCalledTimes(2);
    const second = h.create.mock.calls[1]![0] as {
      spec: { id: string };
      config: { kokoro?: unknown; speakerId: number };
    };
    expect(second.spec.id).toBe('vits-melo-tts-zh_en');
    expect(second.config.kokoro).toBeUndefined();
    expect(h.synth).toHaveBeenLastCalledWith('melo 句', { speakerId: 0 });
  });
});
