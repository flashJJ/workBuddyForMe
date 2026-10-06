import fs from 'node:fs';
import {
  SherpaTtsEngine,
  VOICE_MODELS,
  downloadVoiceModel,
  findMissingFiles,
  type DownloadProgress,
  type TtsEngine,
  type VoiceModelKind,
} from '@wbfm/voice';
import {
  createVoiceModelRepository,
  type DatabaseInstance,
  type SettingsRepository,
} from '@wbfm/database';
import type { VoiceModelStatus, VoiceSettings } from '@wbfm/shared';
import { readVoiceSettings } from './voice-settings';
import { getModelDir, getVoiceModelsRoot } from './model-paths';

interface DownloadJob {
  kind: VoiceModelKind;
  controller: AbortController;
  lastProgress: DownloadProgress | null;
}

export interface SynthResult {
  samples: Float32Array;
  sampleRate: number;
}

/**
 * 进程内语音运行时：模型就绪检查、后台下载任务、TTS 引擎单例。
 *
 * 引擎长驻（模型加载耗时）；配置签名变化（目录/sid/线程/速度）时惰性重建。
 */
export class VoiceRuntime {
  private ttsEngine: TtsEngine | null = null;
  private ttsConfigKey = '';
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

  /** 检查模型文件齐备性（以磁盘为准，DB 状态仅作展示补充） */
  async getModelStatus(): Promise<VoiceModelStatus> {
    const settings = this.settings;
    const results = await Promise.all(
      (['asr', 'tts'] as const).map(async (kind) => {
        const spec = VOICE_MODELS[kind];
        const missing: string[] = [];
        for (const f of spec.files) {
          const full = `${getModelDir(settings, kind, spec.id)}/${f.path}`;
          try {
            const size = fs.statSync(full).size;
            if (f.size > 0 && size !== f.size) missing.push(f.path);
          } catch {
            missing.push(f.path);
          }
        }
        return [kind, missing] as const;
      }),
    );
    const asrMissing = results.find(([k]) => k === 'asr')?.[1] ?? [];
    const ttsMissing = results.find(([k]) => k === 'tts')?.[1] ?? [];
    return {
      asrReady: asrMissing.length === 0,
      ttsReady: ttsMissing.length === 0,
      asrMissing,
      ttsMissing,
      asrTotalBytes: VOICE_MODELS.asr.totalBytes,
      ttsTotalBytes: VOICE_MODELS.tts.totalBytes,
    };
  }

  /** 下载进度（含 DB 持久状态与当前任务实时进度） */
  getDownloadInfo(kind: VoiceModelKind) {
    const persisted = this.voiceModels().get(kind, VOICE_MODELS[kind].id);
    const job = this.jobs.get(kind);
    return {
      active: Boolean(job),
      status: persisted?.status ?? 'missing',
      bytesTotal: persisted?.bytesTotal ?? VOICE_MODELS[kind].totalBytes,
      bytesDone: job?.lastProgress?.bytesDone ?? persisted?.bytesDone ?? 0,
      error: persisted?.error ?? null,
    };
  }

  /** 启动后台下载；已在下载返回 false（幂等） */
  startDownload(kind: VoiceModelKind): boolean {
    if (this.jobs.has(kind)) return false;
    const spec = VOICE_MODELS[kind];
    const settings = this.settings;
    const repo = this.voiceModels();
    const controller = new AbortController();
    repo.markDownloading(kind, spec.id, spec.totalBytes, 0);

    const job: DownloadJob = { kind, controller, lastProgress: null };
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

  /** 取消下载 */
  cancelDownload(kind: VoiceModelKind): void {
    this.jobs.get(kind)?.controller.abort();
  }

  /** 单句合成（路由/试听）；引擎缺失模型时抛 VoiceEngineError（带 hint） */
  async synthesize(text: string): Promise<SynthResult> {
    const engine = await this.ensureTts();
    return engine.synthesize(text);
  }

  private async ensureTts(): Promise<TtsEngine> {
    const s = this.settings;
    const key = [
      getModelDir(s, 'tts', VOICE_MODELS.tts.id),
      s.ttsSpeakerId,
      s.ttsSpeed,
      s.ttsNumThreads,
    ].join('|');
    if (this.ttsEngine && this.ttsConfigKey === key) return this.ttsEngine;
    await this.ttsEngine?.dispose();
    this.ttsEngine = await SherpaTtsEngine.create({
      spec: VOICE_MODELS.tts,
      config: {
        modelDir: getModelDir(s, 'tts', VOICE_MODELS.tts.id),
        speakerId: s.ttsSpeakerId,
        speed: s.ttsSpeed,
        numThreads: s.ttsNumThreads,
        provider: 'cpu',
      },
    });
    this.ttsConfigKey = key;
    return this.ttsEngine;
  }

  /** 设置变更后让引擎下次调用时按新配置重建 */
  invalidateTts(): void {
    this.ttsConfigKey = '';
  }
}
