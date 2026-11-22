import {
  SherpaAsrEngine,
  createSherpaTtsEngine,
  VOICE_MODELS,
  decodePcm16Wav,
  resampleLinear,
  ASR_SAMPLE_RATE,
  VoiceEngineError,
  type AsrEngine,
  type TtsChunkSink,
  type TtsEngine,
  type TtsSynthOptions,
  type VoiceModelKind,
} from '@wbfm/voice';
import type { DatabaseInstance, SettingsRepository } from '@wbfm/database';
import {
  getAvatarSpeakerId,
  type VoiceModelFileStatus,
  type VoiceSettings,
} from '@wbfm/shared/schemas';
import { readVoiceSettings } from './voice-settings';
import { getModelDir } from './model-paths';
import {
  asrConfigKey,
  buildAsrEngineConfig,
  buildTtsEngineConfig,
  ttsConfigKey,
} from './voice-engine-config';
import { readVrmVoiceOverride } from './voice-avatar-override';
import { SynthesisCache, synthesisCacheKey } from './synthesis-cache';
import { VoiceModelDownloads } from './downloads/voice-model-downloads';
import { VoiceCloudTts } from './cloud/voice-cloud-tts';
import type { SecretCipher } from '../secrets/cipher';
import type { SynthResult, TranscribeResult } from './voice-runtime-types';

/**
 * 进程内语音运行时：模型状态、下载任务、TTS/ASR 引擎单例与短句缓存。
 * 引擎长驻；模型/目录/线程变化时重建，sid 与语速逐句传入。
 * 模型下载与在线引擎分别下沉到 VoiceModelDownloads / VoiceCloudTts。
 */
export class VoiceRuntime {
  private ttsEngine: TtsEngine | null = null;
  private ttsConfigKey = '';
  /** 正在创建的 TTS 引擎：并发预热/首句共用同一次创建，避免同时加载出两个 worker */
  private ttsPending: Promise<TtsEngine> | null = null;
  private asrEngine: AsrEngine | null = null;
  private asrConfigKey = '';
  private prewarmJob: Promise<boolean> | null = null;
  private readonly synthesisCache = new SynthesisCache();
  private readonly downloads: VoiceModelDownloads;
  private readonly cloud: VoiceCloudTts;

  constructor(
    private readonly db: DatabaseInstance,
    private readonly settingsRepo: SettingsRepository,
    cipher?: SecretCipher | null,
  ) {
    this.downloads = new VoiceModelDownloads(db, settingsRepo, () => {
      void this.prewarmTts(true);
    });
    // 在线 TTS 凭据复用 SecretCipher；测试/无加密环境缺省时在线引擎视为未配置
    this.cloud = new VoiceCloudTts(db, cipher);
  }

  private get settings(): VoiceSettings {
    return readVoiceSettings(this.settingsRepo);
  }

  private ttsSpec(ttsModel?: VoiceSettings['ttsModel']) {
    return this.downloads.ttsSpec(ttsModel);
  }

  /** 检查模型文件齐备性（以磁盘为准，DB 状态仅作展示补充）；路由 GET models/status 调用 */
  async getModelStatus(): Promise<VoiceModelFileStatus> {
    const settings = this.settings;
    const status = await this.downloads.getModelStatus();
    // 在线引擎不依赖本地模型：腾讯云看凭据、微软 Edge 免密钥；关闭朗读则恒为未就绪
    if (settings.ttsEngine === 'tencent' || settings.ttsEngine === 'edge') {
      status.ttsReady = this.cloud.isReady(settings);
      status.ttsMissing = [];
    } else if (settings.ttsEngine === 'none') {
      status.ttsReady = false;
    }
    return status;
  }

  /** 下载进度（含 DB 持久状态与当前任务实时进度）；tts 可指定模型 */
  getDownloadInfo(kind: VoiceModelKind, ttsModel?: VoiceSettings['ttsModel']) {
    return this.downloads.getDownloadInfo(kind, ttsModel);
  }

  /** 启动后台下载；已有同 kind 任务（含另一套 TTS）时返回 false。tts 可指定模型 */
  startDownload(kind: VoiceModelKind, ttsModel?: VoiceSettings['ttsModel']): boolean {
    return this.downloads.startDownload(kind, ttsModel);
  }

  /** 取消下载（tts 可指定模型；只中止规格匹配的活动任务） */
  cancelDownload(kind: VoiceModelKind, ttsModel?: VoiceSettings['ttsModel']): void {
    this.downloads.cancelDownload(kind, ttsModel);
  }

  /** 单句合成：显式 sid → 角色绑定（含导入 VRM）→ 默认；短句命中缓存。 */
  async synthesize(text: string, speakerId?: number, speed?: number): Promise<SynthResult> {
    return this.synthesizeInternal(text, speakerId, speed);
  }

  /**
   * 流式单句合成：增量 PCM 通过 sink 回传，返回值仍为完整结果（供缓存/兜底）。
   * 引擎未实现流式时退化为一次性回传；signal 在块边界生效。
   */
  async synthesizeStream(
    text: string,
    opts: TtsSynthOptions | undefined,
    sink: TtsChunkSink,
  ): Promise<SynthResult> {
    return this.synthesizeInternal(text, opts?.speakerId, opts?.speed, sink, opts?.signal);
  }

  private async synthesizeInternal(
    text: string,
    speakerId?: number,
    speed?: number,
    sink?: TtsChunkSink,
    signal?: AbortSignal,
  ): Promise<SynthResult> {
    if (signal?.aborted) throw new VoiceEngineError('tts', '合成已取消');
    const settings = this.settings;
    if (settings.ttsEngine === 'none') {
      throw new VoiceEngineError('tts', '朗读已关闭', '在语音设置中开启朗读或选择本地引擎');
    }
    // 在线引擎优先：逐句 HTTPS 合成，失败自动回退本地（离线兜底）
    const online = this.cloud.ensure(settings);
    if (online) {
      // v4.20：在线引擎支持流式时边收边下发；已下发过分片则不回退，避免重复朗读
      let emitted = false;
      const onlineSink: TtsChunkSink = (chunk) => {
        emitted = true;
        sink?.(chunk);
      };
      try {
        const opts = {
          speed: speed ?? settings.ttsSpeed,
          ...(signal ? { signal } : {}),
        };
        return online.synthesizeStream
          ? await online.synthesizeStream(text, opts, onlineSink)
          : await online.synthesize(text, opts).then((result) => {
              onlineSink(result);
              return result;
            });
      } catch (error) {
        if (signal?.aborted || emitted) throw error;
        console.warn(
          '[voice:tts] 在线合成失败，回退本地引擎：',
          (error as Error).message,
        );
      }
    }
    const spec = this.ttsSpec(settings.ttsModel);
    const avatarModelId = settings.avatarModelId;
    // 单声模型（Melo/Matcha）固定 sid=0；Kokoro 按角色绑定
    const sid =
      spec.engine === 'melo' || spec.engine === 'matcha'
        ? 0
        : speakerId ?? getAvatarSpeakerId(avatarModelId, readVrmVoiceOverride(this.db, avatarModelId));
    const synthSpeed = speed ?? settings.ttsSpeed;

    // 短句优先命中缓存：与引擎加载无关，试听/问候/剧场重复句可零合成返回
    const cacheKey = synthesisCacheKey(spec.id, sid, synthSpeed, text);
    const cached = this.synthesisCache.get(cacheKey);
    if (cached) {
      sink?.(cached);
      return cached;
    }

    const engine = await this.ensureTts();
    if (signal?.aborted) throw new VoiceEngineError('tts', '合成已取消');
    const synthOpts: TtsSynthOptions = {
      speakerId: sid,
      speed: synthSpeed,
      ...(signal ? { signal } : {}),
    };
    const result = engine.synthesizeStream
      ? await engine.synthesizeStream(text, synthOpts, sink ?? (() => undefined))
      : await engine.synthesize(text, synthOpts).then((r) => {
          sink?.(r);
          return r;
        });
    this.synthesisCache.set(cacheKey, result, text);
    return result;
  }

  /**
   * 识别上传的 WAV：解码 → 必要时重采样到 16k → ASR。
   * 录音端本就采 16k，重采样仅为浏览器/设备采样率不一致的兜底。
   */
  async transcribeWav(wav: Uint8Array): Promise<TranscribeResult> {
    const decoded = decodePcm16Wav(Buffer.from(wav));
    const samples =
      decoded.sampleRate === ASR_SAMPLE_RATE
        ? decoded.samples
        : resampleLinear(decoded.samples, decoded.sampleRate, ASR_SAMPLE_RATE);
    const engine = await this.ensureAsr();
    return engine.transcribe(samples);
  }

  private async ensureTts(): Promise<TtsEngine> {
    const s = this.settings;
    const spec = this.ttsSpec();
    const modelDir = getModelDir(s, 'tts', spec.id);
    // 引擎缓存键含模型（melo/kokoro 配置不同）；sid 逐句传入不进键
    const key = ttsConfigKey(spec, modelDir, s);
    if (this.ttsEngine && this.ttsConfigKey === key) return this.ttsEngine;

    // 并发预热/首句共用同一次创建：否则会同时加载出两个 worker，被覆盖的那个永不释放
    if (!this.ttsPending) {
      this.ttsPending = (async () => {
        await this.ttsEngine?.dispose();
        // 默认 worker 线程合成：原生推理同步执行，留在主线程会阻塞 SSE 与模型流
        const engine = await createSherpaTtsEngine({
          spec,
          config: buildTtsEngineConfig(spec, modelDir, s),
        });
        this.ttsEngine = engine;
        this.ttsConfigKey = key;
        this.synthesisCache.clear();
        return engine;
      })().finally(() => {
        this.ttsPending = null;
      });
    }
    const engine = await this.ttsPending;
    // 创建期间设置已切到另一套配置：按最新设置重来（旧引擎留给下一次重建时释放）
    return this.ttsConfigKey !== key ? this.ensureTts() : engine;
  }

  /**
   * 启动预热：在服务就绪时提前拉起 worker 与模型，避免第一句朗读额外背模型加载耗时。
   * 模型未下载时静默跳过；预热失败不抛出（首次朗读会再试并给出真实错误）。
   * force=true 用于模型下载完成/切换模型后重新预热；失败结果不永久缓存，下次可重试。
   */
  prewarmTts(force = false): Promise<boolean> {
    if (force) this.prewarmJob = null;
    if (!this.prewarmJob) {
      this.prewarmJob = this.doPrewarmTts().then((ok) => {
        if (!ok) this.prewarmJob = null;
        return ok;
      });
    }
    return this.prewarmJob;
  }

  private async doPrewarmTts(): Promise<boolean> {
    try {
      // 在线引擎不加载本地模型；切回本地时设置路由会 force 预热
      if (this.settings.ttsEngine === 'tencent' || this.settings.ttsEngine === 'edge') {
        return true;
      }
      const status = await this.getModelStatus();
      if (!status.ttsReady) {
        console.warn('[voice:tts] 模型未就绪，跳过启动预热');
        return false;
      }
      const started = Date.now();
      await this.ensureTts();
      console.warn(`[voice:tts] 启动预热完成（${status.activeTtsModel}，${Date.now() - started}ms）`);
      return true;
    } catch (error) {
      console.warn('[voice:tts] 启动预热失败，首次朗读时重试：', (error as Error).message);
      return false;
    }
  }

  /** 设置变更后让引擎下次调用时按新配置重建，并清空预热与短句缓存 */
  invalidateTts(): void {
    this.ttsConfigKey = '';
    this.prewarmJob = null;
    this.cloud.invalidate();
    this.synthesisCache.clear();
  }

  invalidateAsr(): void {
    this.asrConfigKey = '';
  }

  private async ensureAsr(): Promise<AsrEngine> {
    const s = this.settings;
    const modelDir = getModelDir(s, 'asr', VOICE_MODELS.asr.id);
    const key = asrConfigKey(modelDir, s);
    if (this.asrEngine && this.asrConfigKey === key) return this.asrEngine;
    await this.asrEngine?.dispose();
    this.asrEngine = await SherpaAsrEngine.create({
      spec: VOICE_MODELS.asr,
      config: buildAsrEngineConfig(modelDir, s),
      useItn: true,
    });
    this.asrConfigKey = key;
    return this.asrEngine;
  }
}
