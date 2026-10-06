import type { DatabaseInstance } from '../client';
import { nowIso } from '../utils/time';

export type VoiceModelDownloadStatus = 'missing' | 'downloading' | 'ready' | 'error';

export interface VoiceModelState {
  kind: 'asr' | 'tts';
  modelId: string;
  status: VoiceModelDownloadStatus;
  bytesTotal: number;
  bytesDone: number;
  error: string | null;
  updatedAt: string;
}

/**
 * v014 voice_models 仓储：记录本地语音模型下载状态（文件本体在磁盘 userData）。
 */
export function createVoiceModelRepository(db: DatabaseInstance) {
  const upsert = (state: Omit<VoiceModelState, 'updatedAt'>): void => {
    db.prepare(
      `INSERT INTO voice_models(kind, model_id, status, bytes_total, bytes_done, error, updated_at)
       VALUES (@kind, @modelId, @status, @bytesTotal, @bytesDone, @error, @updatedAt)
       ON CONFLICT(kind, model_id) DO UPDATE SET
         status=excluded.status,
         bytes_total=excluded.bytes_total,
         bytes_done=excluded.bytes_done,
         error=excluded.error,
         updated_at=excluded.updated_at`,
    ).run({
      kind: state.kind,
      modelId: state.modelId,
      status: state.status,
      bytesTotal: state.bytesTotal,
      bytesDone: state.bytesDone,
      error: state.error,
      updatedAt: nowIso(),
    });
  };

  return {
    get(kind: 'asr' | 'tts', modelId: string): VoiceModelState | null {
      const row = db
        .prepare(`SELECT * FROM voice_models WHERE kind = ? AND model_id = ?`)
        .get(kind, modelId) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        kind: String(row.kind) as 'asr' | 'tts',
        modelId: String(row.model_id),
        status: String(row.status) as VoiceModelDownloadStatus,
        bytesTotal: Number(row.bytes_total),
        bytesDone: Number(row.bytes_done),
        error: (row.error as string | null) ?? null,
        updatedAt: String(row.updated_at),
      };
    },

    upsert,

    markDownloading(kind: 'asr' | 'tts', modelId: string, bytesTotal: number, bytesDone = 0): void {
      upsert({ kind, modelId, status: 'downloading', bytesTotal, bytesDone, error: null });
    },
    markProgress(kind: 'asr' | 'tts', modelId: string, bytesDone: number, bytesTotal: number): void {
      upsert({ kind, modelId, status: 'downloading', bytesTotal, bytesDone, error: null });
    },
    markReady(kind: 'asr' | 'tts', modelId: string, bytesTotal: number): void {
      upsert({ kind, modelId, status: 'ready', bytesTotal, bytesDone: bytesTotal, error: null });
    },
    markError(kind: 'asr' | 'tts', modelId: string, error: string, bytesTotal: number): void {
      upsert({ kind, modelId, status: 'error', bytesTotal, bytesDone: 0, error });
    },
  };
}

export type VoiceModelRepository = ReturnType<typeof createVoiceModelRepository>;
