import { mkdirSync } from 'node:fs';
import { resolveDataPath } from './paths';

/** 数据根下的标准子目录（相对 POSIX 风格路径） */
export const DATA_SUBDIRS = {
  /** SQLite 数据库文件 */
  db: 'db',
  /** 上传的原始文档 */
  files: 'files',
  /** v0.3 聊天图片附件 */
  attachments: 'attachments',
  /** Embedding 等缓存 */
  embeddingsCache: 'cache/embeddings',
  /** 本地密钥文件（Web 模式 AES-GCM） */
  keys: 'keys',
  /** 运行日志 */
  logs: 'logs',
  /** 运行时配置（窗口状态等） */
  config: 'config',
} as const;

export type DataSubdirKey = keyof typeof DATA_SUBDIRS;

/** 解析某个标准子目录的绝对路径 */
export function getDataDir(key: DataSubdirKey): string {
  return resolveDataPath(DATA_SUBDIRS[key]);
}

/** 数据库文件完整路径 */
export function getDatabasePath(): string {
  return resolveDataPath(DATA_SUBDIRS.db, 'wbfm.sqlite');
}

/** 确保数据根与全部标准子目录存在（幂等） */
export function ensureDataDirs(): Record<DataSubdirKey, string> {
  const result = {} as Record<DataSubdirKey, string>;
  for (const key of Object.keys(DATA_SUBDIRS) as DataSubdirKey[]) {
    const dir = getDataDir(key);
    mkdirSync(dir, { recursive: true });
    result[key] = dir;
  }
  return result;
}
