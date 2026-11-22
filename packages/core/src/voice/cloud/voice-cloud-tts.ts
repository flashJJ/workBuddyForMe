import type { TtsEngine } from '@wbfm/voice';
import type { DatabaseInstance } from '@wbfm/database';
import type { VoiceSettings } from '@wbfm/shared/schemas';
import { createVoiceCloudCredentialStore } from './voice-cloud-credentials';
import { TencentTtsEngine } from './tencent-tts-engine';
import type { SecretCipher } from '../../secrets/cipher';

/**
 * 在线 TTS 引擎管理（从 VoiceRuntime 拆出，保持单文件行数上限）。
 * 凭据缺失时返回 null；配置变化时惰性重建；无长驻资源，invalidate 直接丢弃。
 */
export class VoiceCloudTts {
  private engine: TtsEngine | null = null;
  private configKey = '';
  private readonly store: ReturnType<typeof createVoiceCloudCredentialStore> | null;

  constructor(db: DatabaseInstance, cipher?: SecretCipher | null) {
    this.store = cipher ? createVoiceCloudCredentialStore({ db, cipher }) : null;
  }

  /** 是否已配置可用的在线凭据（GET models/status 的 ttsReady 判定） */
  hasCredentials(): boolean {
    return Boolean(this.store?.get());
  }

  /** 按凭据 + 音色/采样率/地域复用在线引擎；未配置返回 null */
  ensure(settings: VoiceSettings): TtsEngine | null {
    if (settings.ttsEngine !== 'tencent') return null;
    const credentials = this.store?.get();
    if (!credentials) return null;
    const key = [
      credentials.secretId,
      credentials.secretKey,
      credentials.region,
      settings.tencentVoiceType,
      settings.tencentModelType,
      settings.tencentSampleRate,
    ].join('|');
    if (this.engine && this.configKey === key) return this.engine;
    void this.engine?.dispose();
    this.engine = new TencentTtsEngine({
      secretId: credentials.secretId,
      secretKey: credentials.secretKey,
      region: credentials.region,
      voiceType: settings.tencentVoiceType,
      modelType: settings.tencentModelType,
      sampleRate: settings.tencentSampleRate,
      speed: settings.ttsSpeed,
    });
    this.configKey = key;
    return this.engine;
  }

  invalidate(): void {
    this.engine = null;
    this.configKey = '';
  }
}
