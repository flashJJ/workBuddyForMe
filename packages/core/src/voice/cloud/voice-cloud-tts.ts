import type { TtsEngine } from '@wbfm/voice';
import type { DatabaseInstance } from '@wbfm/database';
import type { VoiceSettings } from '@wbfm/shared/schemas';
import { createVoiceCloudCredentialStore } from './voice-cloud-credentials';
import { TencentTtsEngine } from './tencent-tts-engine';
import { EdgeTtsEngine } from './edge-tts-engine';
import type { SecretCipher } from '../../secrets/cipher';

/**
 * 在线 TTS 引擎管理（从 VoiceRuntime 拆出，保持单文件行数上限）。
 * 腾讯云看凭据、微软 Edge 免密钥；配置变化时惰性重建，无长驻资源。
 */
export class VoiceCloudTts {
  private engine: TtsEngine | null = null;
  private configKey = '';
  private readonly store: ReturnType<typeof createVoiceCloudCredentialStore> | null;

  constructor(db: DatabaseInstance, cipher?: SecretCipher | null) {
    this.store = cipher ? createVoiceCloudCredentialStore({ db, cipher }) : null;
  }

  /** 当前在线引擎是否配置就绪（GET models/status 的 ttsReady 判定） */
  isReady(settings: VoiceSettings): boolean {
    if (settings.ttsEngine === 'edge') return true;
    if (settings.ttsEngine === 'tencent') return Boolean(this.store?.get());
    return false;
  }

  /** 按引擎配置复用实例；非在线引擎/腾讯云缺凭据返回 null */
  ensure(settings: VoiceSettings): TtsEngine | null {
    if (settings.ttsEngine === 'edge') return this.ensureEdge(settings);
    if (settings.ttsEngine === 'tencent') return this.ensureTencent(settings);
    return null;
  }

  private ensureEdge(settings: VoiceSettings): TtsEngine {
    const key = `edge|${settings.edgeVoice}`;
    if (this.engine && this.configKey === key) return this.engine;
    void this.engine?.dispose();
    this.engine = new EdgeTtsEngine({ voice: settings.edgeVoice });
    this.configKey = key;
    return this.engine;
  }

  private ensureTencent(settings: VoiceSettings): TtsEngine | null {
    const credentials = this.store?.get();
    if (!credentials) return null;
    const key = [
      'tencent',
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
