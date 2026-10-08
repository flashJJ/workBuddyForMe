import fs from 'node:fs';
import path from 'node:path';
import {
  SherpaAsrEngine,
  SherpaTtsEngine,
  VOICE_MODELS,
  getVoiceModelSpec,
  downloadVoiceModel,
  findMissingFiles,
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
import type { DownloadJob, SynthResult, TranscribeResult } from './voice-runtime-types';

const TTS_MODEL_SPECS: VoiceModelSpec[] = VOICE_MODELS.tts;

/**
 * 进程内语音运行时：模型就绪检查、后台下载任务、TTS 引擎单例。
 *
 * 引擎长驻（模型加载耗时）；配置签名变化（目录/sid/线程/速度）时惰性重建。
 */
export class VoiceRuntime {
  private ttsEngine: TtsEngine | null = null;
  private ttsConfigKey = '';
  private asrEngine: AsrEngine | null = null;
  private asrConfigKey = '';
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

  /** 当前设置选中的 TTS 模型规格（melo 单声低延迟 / kokoro 多角色）；可显式指定 */
  private ttsSpec(ttsModel?: VoiceSettings['ttsModel']): VoiceModelSpec {
    return getVoiceModelSpec('tts', ttsModel ?? this.settings.ttsModel);
  }

  /** 检查模型文件齐备性（以磁盘为准，DB 状态仅作展示补充）；路由 GET models/status 调用 */
  async getModelStatus(): Promise<VoiceModelFileStatus> {
    const settings = this.settings;
    const checked = await Promise.all(
      (['asr', 'tts'] as const).map(async (kind) => {
        const list = kind === 'asr' ? [VOICE_MODELS.asr] : TTS_MODEL_SPECS;
        const missing: string[] = [];
        for (const spec of list) {
          for (const f of spec.files) {
            const full = `${getModelDir(settings, kind, spec.id)}/${f.path}`;
            try {
              const size = fs.statSync(full).size;
              if (f.size > 0 && size !== f.size) missing.push(`${spec.id}/${f.path}`);
            } catch {
              missing.push(`${spec.id}/${f.path}`);
            }
          }
        }
        return [kind, missing] as const;
      }),
    );
    const asrMissing = checked.find(([k]) => k === 'asr')?.[1] ?? [];
    const ttsMissingAll = checked.find(([k]) => k === 'tts')?.[1] ?? [];
    const activeSpec = this.ttsSpec();
    const ttsModels = TTS_MODEL_SPECS.map((spec) => {
      const prefix = `${spec.id}/`;
      const ownMissing = ttsMissingAll
        .filter((p) => p.startsWith(prefix))
        .map((p) => p.slice(prefix.length));
      return {
        model: spec.engine ?? 'kokoro',
        label: spec.label,
        totalBytes: spec.totalBytes,
        ready: ownMissing.length === 0,
        missing: ownMissing,
      };
    });
    return {
      asrReady: asrMissing.length === 0,
      // 仅当前选中模型要求就绪；另一套缺失不阻塞朗读
      ttsReady: ttsModels.find((m) => m.model === activeSpec.engine)?.ready ?? false,
      asrMissing,
      ttsMissing: ttsModels.find((m) => m.model === activeSpec.engine)?.missing ?? [],
      asrTotalBytes: VOICE_MODELS.asr.totalBytes,
      ttsTotalBytes: activeSpec.totalBytes,
      ttsModels: ttsModels.map(({ model, label, totalBytes, ready, missing }) => ({
        model,
        label,
        totalBytes,
        ready,
        missing,
      })),
      activeTtsModel: activeSpec.engine ?? 'kokoro',
    };
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
      mirror: !settings.modelMirrorBase || settings.modelMirrorBase.includes('hf-mirror'),
      signal: controller.signal,
      onProgress: (p) => {
        job.lastProgress = p;
        repo.markProgress(kind, spec.id, p.bytesDone, p.bytesTotal);
      },
    })
      .then(async () => {
        const missing = await findMissingFiles(spec, async (rel) => {
          try {
            return fs.statSync(`${getModelDir(settings, kind, spec.id)}/${rel}`).size;
          } catch {
            return null;
          }
        });
        if (missing.length > 0) throw new Error(`下载后校验缺失：${missing.join(', ')}`);
        repo.markReady(kind, spec.id, spec.totalBytes);
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

  /**
   * 单句合成（路由/试听/对话桥）。
   * sid 解析：调用方显式指定（如请求 voice.speakerId 或角色试听）→ 当前角色绑定
   * （settings.avatarModelId → AVATAR_TTS_VOICES）→ 引擎默认（兜底 ttsSpeakerId）。
   */
  async synthesize(text: string, speakerId?: number): Promise<SynthResult> {
    const engine = await this.ensureTts();
    // MeloTTS 为单说话人模型，sid 无意义；Kokoro 才按角色绑定声线
    const spec = this.ttsSpec();
    const sid = spec.engine === 'melo' ? 0 : speakerId ?? getAvatarSpeakerId(this.settings.avatarModelId);
    return engine.synthesize(text, { speakerId: sid });
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
    const key = [spec.id, modelDir, s.ttsSpeed, s.ttsNumThreads].join('|');
    if (this.ttsEngine && this.ttsConfigKey === key) return this.ttsEngine;
    await this.ttsEngine?.dispose();
    this.ttsEngine = await SherpaTtsEngine.create({
      spec,
      config:
        spec.engine === 'melo'
          ? {
              // VITS 路径由 SherpaTtsEngine 按 modelDir 自行拼出（model/lexicon/tokens/dict）
              modelDir,
              speakerId: 0,
              speed: s.ttsSpeed,
              numThreads: s.ttsNumThreads,
              provider: 'cpu',
            }
          : {
              modelDir,
              speakerId: s.ttsSpeakerId,
              speed: s.ttsSpeed,
              numThreads: s.ttsNumThreads,
              provider: 'cpu',
              // Kokoro 多说话人：voices 嵌入库 + espeak 数据 + 中英词典 + 中文规整 FST
              kokoro: {
                voices: path.join(modelDir, 'voices.bin'),
                dataDir: path.join(modelDir, 'espeak-ng-data'),
                lexicon: [
                  path.join(modelDir, 'lexicon-us-en.txt'),
                  path.join(modelDir, 'lexicon-zh.txt'),
                ].join(','),
                ruleFsts: ['date-zh.fst', 'number-zh.fst', 'phone-zh.fst']
                  .map((f) => path.join(modelDir, f))
                  .join(','),
              },
            },
    });
    this.ttsConfigKey = key;
    return this.ttsEngine;
  }

  /** 设置变更后让引擎下次调用时按新配置重建 */
  invalidateTts(): void {
    this.ttsConfigKey = '';
  }

  invalidateAsr(): void {
    this.asrConfigKey = '';
  }

  private async ensureAsr(): Promise<AsrEngine> {
    const s = this.settings;
    const key = [getModelDir(s, 'asr', VOICE_MODELS.asr.id), s.asrNumThreads].join('|');
    if (this.asrEngine && this.asrConfigKey === key) return this.asrEngine;
    await this.asrEngine?.dispose();
    this.asrEngine = await SherpaAsrEngine.create({
      spec: VOICE_MODELS.asr,
      config: {
        modelDir: getModelDir(s, 'asr', VOICE_MODELS.asr.id),
        numThreads: s.asrNumThreads,
        provider: 'cpu',
      },
      useItn: true,
    });
    this.asrConfigKey = key;
    return this.asrEngine;
  }
}
