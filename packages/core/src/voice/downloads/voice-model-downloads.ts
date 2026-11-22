import fs from 'node:fs';
import {
  VOICE_MODELS,
  downloadVoiceModel,
  findFileIssues,
  getVoiceModelSpec,
  HF_MIRROR_BASE,
  type VoiceModelKind,
  type VoiceModelSpec,
} from '@wbfm/voice';
import {
  createVoiceModelRepository,
  type DatabaseInstance,
  type SettingsRepository,
} from '@wbfm/database';
import type { VoiceModelFileStatus, VoiceSettings } from '@wbfm/shared/schemas';
import { readVoiceSettings } from '../voice-settings';
import { getModelDir, getVoiceModelsRoot } from '../model-paths';
import { readModelStatus } from '../voice-model-status';
import type { DownloadJob } from '../voice-runtime-types';

export const TTS_MODEL_SPECS: VoiceModelSpec[] = VOICE_MODELS.tts;

/**
 * 本地语音模型的下载任务与磁盘状态（从 VoiceRuntime 拆出，保持单文件行数上限）。
 * - 下载任务按 kind 单飞；tts 任务记录 specId 以区分 melo/kokoro/matcha；
 * - 磁盘齐备时校正 DB 持久状态；
 * - 下载完成回调由 VoiceRuntime 注入（用于后台预热本地引擎）。
 */
export class VoiceModelDownloads {
  private readonly jobs = new Map<VoiceModelKind, DownloadJob>();

  constructor(
    private readonly db: DatabaseInstance,
    private readonly settingsRepo: SettingsRepository,
    private readonly onTtsDownloaded: () => void = () => undefined,
  ) {}

  private get settings(): VoiceSettings {
    return readVoiceSettings(this.settingsRepo);
  }

  private voiceModels() {
    return createVoiceModelRepository(this.db);
  }

  /** 当前设置选中的 TTS 模型规格（melo 单声 / kokoro 多角色 / matcha 快速单声） */
  ttsSpec(ttsModel?: VoiceSettings['ttsModel']): VoiceModelSpec {
    return getVoiceModelSpec('tts', ttsModel ?? this.settings.ttsModel);
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
        if (kind === 'tts') this.onTtsDownloaded();
      })
      .catch((error: unknown) => {
        if ((error as Error).name === 'AbortError') {
          // 用户取消：必须把持久化状态从 downloading 拉回 missing，
          // 否则 UI 会永久停在「下载中」，且没有开始按钮可重新下载。
          repo.markCancelled(kind, spec.id, job.lastProgress?.bytesDone ?? 0, spec.totalBytes);
          return;
        }
        repo.markError(kind, spec.id, (error as Error).message, spec.totalBytes);
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
}
