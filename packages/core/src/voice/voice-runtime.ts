import fs from 'node:fs';
import {
  SherpaAsrEngine,
  createSherpaTtsEngine,
  VOICE_MODELS,
  getVoiceModelSpec,
  downloadVoiceModel,
  findFileIssues,
  HF_MIRROR_BASE,
  decodePcm16Wav,
  resampleLinear,
  ASR_SAMPLE_RATE,
  type AsrEngine,
  type TtsEngine,
  type VoiceModelKind,
  type VoiceModelSpec,
} from '@wbfm/voice';
import {
  createVoiceModelRepository,
  type DatabaseInstance,
  type SettingsRepository,
} from '@wbfm/database';
import {
  getAvatarSpeakerId,
  type VoiceModelFileStatus,
  type VoiceSettings,
} from '@wbfm/shared/schemas';
import { readVoiceSettings } from './voice-settings';
import { getModelDir, getVoiceModelsRoot } from './model-paths';
import { readModelStatus } from './voice-model-status';
import {
  asrConfigKey,
  buildAsrEngineConfig,
  buildTtsEngineConfig,
  ttsConfigKey,
} from './voice-engine-config';
import { readVrmVoiceOverride } from './voice-avatar-override';
import { SynthesisCache, synthesisCacheKey } from './synthesis-cache';
import type { DownloadJob, SynthResult, TranscribeResult } from './voice-runtime-types';

const TTS_MODEL_SPECS: VoiceModelSpec[] = VOICE_MODELS.tts;

/**
 * 进程内语音运行时：模型状态、下载任务、TTS/ASR 引擎单例与短句缓存。
 * 引擎长驻；模型/目录/线程变化时重建，sid 与语速逐句传入。
 */
export class VoiceRuntime {
  private ttsEngine: TtsEngine | null = null;
  private ttsConfigKey = '';
  private asrEngine: AsrEngine | null = null;
  private asrConfigKey = '';
  private prewarmJob: Promise<boolean> | null = null;
  private readonly synthesisCache = new SynthesisCache();
  private readonly jobs = new Map<VoiceModelKind, DownloadJob>();

  constructor(
    private readonly db: DatabaseInstance,
    private readonly settingsRepo: SettingsRepository,
  ) {}

  private get settings(): VoiceSettings {
    return readVoiceSettings(this.settingsRepo);
  }

  private voiceModels() {
    return createVoiceModelRepository(this.db);
  }

  /** 磁盘已齐备时清掉旧的 error/downloading 持久状态；DB 未就绪时静默跳过 */
  private syncReadyStatus(kind: VoiceModelKind, spec: VoiceModelSpec, missing: string[]): void {
    if (missing.length > 0 || this.jobs.has(kind)) return;
    try {
      const repo = this.voiceModels();
      const persisted = repo.get(kind, spec.id);
      if (persisted && persisted.status !== 'ready') {
        repo.markReady(kind, spec.id, spec.totalBytes);
      }
    } catch {
      // 测试或启动早期 DB 未就绪：磁盘状态仍可返回，不阻塞状态接口
    }
  }

  /** 当前设置选中的 TTS 模型规格（melo 单声低延迟 / kokoro 多角色）；可显式指定 */
  private ttsSpec(ttsModel?: VoiceSettings['ttsModel']): VoiceModelSpec {
    return getVoiceModelSpec('tts', ttsModel ?? this.settings.ttsModel);
  }

  /** 检查模型文件齐备性（以磁盘为准，DB 状态仅作展示补充）；路由 GET models/status 调用 */
  async getModelStatus(): Promise<VoiceModelFileStatus> {
    return readModelStatus({
      settings: this.settings,
      ttsSpecs: TTS_MODEL_SPECS,
      activeSpec: this.ttsSpec(),
      syncReady: (kind, spec, missing) => this.syncReadyStatus(kind, spec, missing),
    });
  }

  /** 下载进度（含 DB 持久状态与当前任务实时进度）；tts 可指定模型 */
  getDownloadInfo(kind: VoiceModelKind, ttsModel?: VoiceSettings['ttsModel']) {
    const spec = kind === 'tts' ? this.ttsSpec(ttsModel) : VOICE_MODELS[kind];
    const persisted = this.voiceModels().get(kind, spec.id);
    // 同 kind 的活动任务可能属于另一套 TTS 引擎：规格不匹配时不计入本模型状态
    const job = this.jobs.get(kind);
    const ownJob = job?.specId === spec.id ? job : null;
    return {
      active: Boolean(ownJob),
      status: persisted?.status ?? 'missing',
      bytesTotal: persisted?.bytesTotal ?? spec.totalBytes,
      bytesDone: ownJob?.lastProgress?.bytesDone ?? persisted?.bytesDone ?? 0,
      error: persisted?.error ?? null,
    };
  }

  /** 启动后台下载；已有同 kind 任务（含另一套 TTS）时返回 false。tts 可指定模型 */
  startDownload(kind: VoiceModelKind, ttsModel?: VoiceSettings['ttsModel']): boolean {
    if (this.jobs.has(kind)) return false;
    const settings = this.settings;
    const spec = kind === 'tts' ? this.ttsSpec(ttsModel) : VOICE_MODELS[kind];
    const repo = this.voiceModels();
    const controller = new AbortController();
    repo.markDownloading(kind, spec.id, spec.totalBytes, 0);

    const job: DownloadJob = { kind, specId: spec.id, controller, lastProgress: null };
    this.jobs.set(kind, job);

    void downloadVoiceModel({
      spec,
      targetRoot: getVoiceModelsRoot(settings),
      mirrorBase: settings.modelMirrorBase || HF_MIRROR_BASE,
      signal: controller.signal,
      onProgress: (p) => {
        job.lastProgress = p;
        repo.markProgress(kind, spec.id, p.bytesDone, p.bytesTotal);
      },
    })
      .then(async () => {
        const issues = await findFileIssues(spec, async (rel) => {
          try {
            return fs.statSync(`${getModelDir(settings, kind, spec.id)}/${rel}`).size;
          } catch {
            return null;
          }
        });
        const details: string[] = [];
        if (issues.missing.length > 0) details.push(`缺失: ${issues.missing.join(', ')}`);
        if (issues.sizeMismatch.length > 0) details.push(`大小不符: ${issues.sizeMismatch.join(', ')}`);
        if (details.length > 0) throw new Error(`下载后校验失败：${details.join('；')}`);
        repo.markReady(kind, spec.id, spec.totalBytes);
        // 下载完成立即后台预热；失败静默，不阻塞下载任务收尾
        if (kind === 'tts') void this.prewarmTts(true);
      })
      .catch((error: unknown) => {
        if ((error as Error).name !== 'AbortError') {
          repo.markError(kind, spec.id, (error as Error).message, spec.totalBytes);
        }
      })
      .finally(() => {
        this.jobs.delete(kind);
      });
    return true;
  }

  /** 取消下载（tts 可指定模型；只中止规格匹配的活动任务） */
  cancelDownload(kind: VoiceModelKind, ttsModel?: VoiceSettings['ttsModel']): void {
    const spec = kind === 'tts' ? this.ttsSpec(ttsModel) : VOICE_MODELS[kind];
    const job = this.jobs.get(kind);
    if (job?.specId === spec.id) job.controller.abort();
  }

  /** 单句合成：显式 sid → 角色绑定（含导入 VRM）→ 默认；短句命中缓存。 */
  async synthesize(text: string, speakerId?: number, speed?: number): Promise<SynthResult> {
    const settings = this.settings;
    const spec = this.ttsSpec(settings.ttsModel);
    const avatarModelId = settings.avatarModelId;
    const sid =
      spec.engine === 'melo'
        ? 0
        : speakerId ?? getAvatarSpeakerId(avatarModelId, readVrmVoiceOverride(this.db, avatarModelId));
    const synthSpeed = speed ?? settings.ttsSpeed;

    // 短句优先命中缓存：与引擎加载无关，试听/问候/剧场重复句可零合成返回
    const cacheKey = synthesisCacheKey(spec.id, sid, synthSpeed, text);
    const cached = this.synthesisCache.get(cacheKey);
    if (cached) return cached;

    const engine = await this.ensureTts();
    const result = await engine.synthesize(text, { speakerId: sid, speed: synthSpeed });
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
    await this.ttsEngine?.dispose();
    // 默认 worker 线程合成：原生推理同步执行，留在主线程会阻塞 SSE 与模型流
    this.ttsEngine = await createSherpaTtsEngine({
      spec,
      config: buildTtsEngineConfig(spec, modelDir, s),
    });
    this.ttsConfigKey = key;
    this.synthesisCache.clear();
    return this.ttsEngine;
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
