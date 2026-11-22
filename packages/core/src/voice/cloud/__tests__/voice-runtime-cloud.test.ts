import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VOICE_SETTINGS } from '@wbfm/shared/schemas';
import type { DatabaseInstance, SettingsRepository } from '@wbfm/database';

const h = vi.hoisted(() => ({
  createLocal: vi.fn(),
  localSynth: vi.fn(),
  localDispose: vi.fn(),
  cloudGet: vi.fn(),
  cloudSynth: vi.fn(),
  cloudOptions: [] as unknown[],
}));

vi.mock('../../voice-model-files', () => ({
  listMissingModelFiles: () => [],
}));

vi.mock('../voice-cloud-credentials', () => ({
  createVoiceCloudCredentialStore: () => ({
    get: h.cloudGet,
    view: () => ({ hasCredentials: Boolean(h.cloudGet()), maskedSecretId: null, region: 'ap-guangzhou' }),
    update: vi.fn(),
  }),
}));

vi.mock('../tencent-tts-engine', () => ({
  TencentTtsEngine: class {
    constructor(options: unknown) {
      h.cloudOptions.push(options);
    }
    synthesize = h.cloudSynth;
    dispose = vi.fn();
  },
}));

vi.mock('@wbfm/voice', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wbfm/voice')>()),
  createSherpaTtsEngine: h.createLocal,
}));

import { VoiceRuntime } from '../../voice-runtime';

function makeRuntime(engine: 'sherpa_onnx' | 'tencent') {
  const settings = {
    ...DEFAULT_VOICE_SETTINGS,
    ttsEngine: engine,
    avatarModelId: 'mark',
    ttsModel: 'melo' as const,
    modelsDir: '/tmp/wbfm-voice-cloud-test',
  };
  const settingsRepo = { getJson: vi.fn(() => settings) } as unknown as SettingsRepository;
  const runtime = new VoiceRuntime(
    {} as DatabaseInstance,
    settingsRepo,
    { encrypt: (s: string) => s, decrypt: (s: string) => s } as never,
  );
  return { runtime, settings };
}

describe('VoiceRuntime 在线 TTS 选择与回退', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ttsEngine=tencent 且有凭据：走在线引擎，不创建本地引擎', async () => {
    h.cloudGet.mockReturnValue({ secretId: 'id', secretKey: 'key', region: 'ap-guangzhou' });
    h.cloudSynth.mockResolvedValue({ samples: new Float32Array([0.25]), sampleRate: 16000 });
    const { runtime } = makeRuntime('tencent');
    const result = await runtime.synthesize('你好');
    expect(Array.from(result.samples)).toEqual([0.25]);
    expect(h.cloudSynth).toHaveBeenCalledWith('你好', { speed: 1 });
    expect(h.createLocal).not.toHaveBeenCalled();
  });

  it('在线合成失败：回退本地引擎并返回本地音频', async () => {
    h.cloudGet.mockReturnValue({ secretId: 'id', secretKey: 'key', region: 'ap-guangzhou' });
    h.cloudSynth.mockRejectedValue(new Error('network down'));
    h.createLocal.mockResolvedValue({
      synthesize: h.localSynth,
      dispose: h.localDispose,
    });
    h.localSynth.mockResolvedValue({ samples: new Float32Array([0.5]), sampleRate: 22050 });
    const { runtime } = makeRuntime('tencent');
    const result = await runtime.synthesize('你好');
    expect(Array.from(result.samples)).toEqual([0.5]);
    expect(h.localSynth).toHaveBeenCalled();
  });

  it('未配置凭据：直接回退本地引擎', async () => {
    h.cloudGet.mockReturnValue(null);
    h.createLocal.mockResolvedValue({
      synthesize: h.localSynth,
      dispose: h.localDispose,
    });
    h.localSynth.mockResolvedValue({ samples: new Float32Array([0.75]), sampleRate: 22050 });
    const { runtime } = makeRuntime('tencent');
    const result = await runtime.synthesize('你好');
    expect(Array.from(result.samples)).toEqual([0.75]);
    expect(h.cloudSynth).not.toHaveBeenCalled();
  });
});
