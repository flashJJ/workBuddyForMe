import type { Database } from 'better-sqlite3';

/**
 * v1.0 语音伙伴迁移（版本 14）。纯加法：
 *
 * voice_models：本地语音模型（ASR/TTS）下载状态持久化。
 * 模型文件本体落 userData/models/voice/（不入库），本表只记录下载进度，
 * 用于跨重启恢复「下载中/失败/就绪」状态与设置页展示。
 *
 * 语音设置本身复用既有 settings_kv（key='voice'，JSON），不新增列。
 */
export function migrateV014(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_models (
      kind TEXT NOT NULL CHECK (kind IN ('asr', 'tts')),
      model_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'missing' CHECK (status IN ('missing', 'downloading', 'ready', 'error')),
      bytes_total INTEGER NOT NULL DEFAULT 0,
      bytes_done INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (kind, model_id)
    )
  `);
}
