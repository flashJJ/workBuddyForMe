import { z } from 'zod';
import { stageScenePayloadSchema, STAGE_NAME_MAX } from '@wbfm/shared/schemas';

/**
 * 包内场景文件形状（scenes/*.json）：
 * 不带本机 id（导入端生成新 id）；payload.background.fileRef 在包内改写为
 * backgrounds/<文件名> 相对路径，导入时重新落盘换发 bg-<uuid> 引用。
 */
export const packSceneFileSchema = z
  .object({
    name: z.string().trim().min(1).max(STAGE_NAME_MAX),
    payload: stageScenePayloadSchema,
  })
  .strict();
export type PackSceneFile = z.infer<typeof packSceneFileSchema>;

export type PackEntryKind = 'characterCard' | 'stageScene' | 'stageBackground';

export type PackFatalCode =
  | 'tooLarge'
  | 'notZip'
  | 'unsafeZip'
  | 'manifestMissing'
  | 'manifestInvalid'
  | 'unsupportedVersion'
  | 'entryMissing'
  | 'undeclaredEntry';

export interface PackFatal {
  code: PackFatalCode;
  message: string;
}

export interface PackPreviewEntry {
  kind: PackEntryKind;
  path: string;
  /** 展示名：卡名 / 场景名 / 背景文件名 */
  name: string;
  sizeBytes: number;
  valid: boolean;
  /** 内容校验错误（逐条聚合；有效条目为空数组） */
  errors: string[];
  /** 与本机现有内容同名（卡/场景） */
  conflict: boolean;
  /** 背景条目：引用它的包内场景路径 */
  referencedBy: string[];
}

export interface PackPreviewPackInfo {
  id: string;
  name: string;
  description: string;
  authorName: string;
  authorUrl: string | null;
  packVersion: string;
  createdAt: string;
}

export interface PackPreview {
  fatal: PackFatal | null;
  pack: PackPreviewPackInfo | null;
  entries: PackPreviewEntry[];
  /** 无致命错误且全部条目有效时可导入 */
  importable: boolean;
}

export interface PackImportEntryResult {
  kind: PackEntryKind;
  path: string;
  name: string;
  /** 卡/场景的新本机 id；背景为新 fileRef */
  localId?: string;
  fileRef?: string;
  /** 触发了同名冲突并以副本策略导入 */
  copied: boolean;
}

export interface PackImportResult {
  packId: string;
  packName: string;
  installedAt: string;
  counts: { characterCards: number; stageScenes: number; stageBackgrounds: number };
  entries: PackImportEntryResult[];
}
