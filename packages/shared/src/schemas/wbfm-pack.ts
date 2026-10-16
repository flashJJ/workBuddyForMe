import { z } from 'zod';

/**
 * v2.0 M5 .wbfm-pack mod 包契约（04-mod包manifest规范 M0 冻结形状）。
 *
 * M5 实际落地的内容类型（产品中存在用户自建实体）：
 * - characterCards：v1.8 自建角色卡（cards/*.md）
 * - stageScenes：v1.9 舞台场景（scenes/*.json；04 冻结六类之外的加法键，随 v1.9 实体落地）
 * - stageBackgrounds：场景引用的背景图（backgrounds/*.{png,jpeg,jpg,webp}）
 * 04 规划中的 events/themes/personas/gesturePresets 在产品中无用户自建实体，
 * 本版不导入不导出：出现非空声明整包拒绝（不静默丢弃）。
 */

export const WBFM_PACK_FORMAT = 'wbfm-pack' as const;
export const WBFM_PACK_SCHEMA_VERSION = 1 as const;
export const WBFM_PACK_MIME = 'application/x-wbfm-pack';
export const WBFM_PACK_MAX_BYTES = 20 * 1024 * 1024;

/** 单条目大小上限（04 §3.1） */
export const PACK_CARD_MAX_BYTES = 16 * 1024;
export const PACK_SCENE_MAX_BYTES = 32 * 1024;
export const PACK_BACKGROUND_MAX_BYTES = 2 * 1024 * 1024;

export const PACK_CARD_DIR = 'cards/';
export const PACK_SCENE_DIR = 'scenes/';
export const PACK_BACKGROUND_DIR = 'backgrounds/';
/** 冻结但本版不支持的内容目录（出现实体即拒） */
export const PACK_UNSUPPORTED_DIRS = ['events/', 'themes/', 'personas/', 'gestures/'];

/** 黑名单扩展名（出现即拒，04 §1，含模型/音频二进制） */
export const PACK_BLACKLIST_EXT = [
  '.moc3',
  '.model3.json',
  '.motion3.json',
  '.physics3.json',
  '.cdi3.json',
  '.vrm',
  '.glb',
  '.gltf',
  '.fbx',
  '.wav',
  '.mp3',
  '.ogg',
  '.m4a',
  '.flac',
] as const;

/** 禁含路径前缀（04 §4：不迁移助手行/设置/数据库） */
export const PACK_FORBIDDEN_PREFIXES = ['assistants/', 'settings/'];

const packAuthorSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.string().trim().max(500).url().nullable(),
});

const cardEntrySchema = z
  .string()
  .min(1)
  .regex(/^cards\/[\w.\-\u4e00-\u9fff]+\.md$/, '角色卡条目必须位于 cards/ 且为 .md');
const sceneEntrySchema = z
  .string()
  .min(1)
  .regex(/^scenes\/[\w.\-\u4e00-\u9fff]+\.json$/, '场景条目必须位于 scenes/ 且为 .json');
const backgroundEntrySchema = z
  .string()
  .min(1)
  .regex(
    /^backgrounds\/[\w.-]+\.(png|jpeg|jpg|webp)$/,
    '背景条目必须位于 backgrounds/ 且为 png/jpeg/jpg/webp',
  );

const contentsSchema = z
  .object({
    characterCards: z.array(cardEntrySchema).max(100),
    /** 本版冻结不支持的四类：仅允许空数组或缺省，非空即拒绝 */
    events: z.array(z.string()).max(0),
    themes: z.array(z.string()).max(0),
    personas: z.array(z.string()).max(0),
    gestures: z.array(z.string()).max(0),
    stageScenes: z.array(sceneEntrySchema).max(50),
    stageBackgrounds: z.array(backgroundEntrySchema).max(20),
  })
  .strict();

export const packManifestSchema = z
  .object({
    format: z.literal(WBFM_PACK_FORMAT),
    schemaVersion: z.number().int().positive(),
    pack: z
      .object({
        id: z
          .string()
          .trim()
          .min(3)
          .max(80)
          .regex(/^p_[a-zA-Z0-9-]+$/, '包 id 必须形如 p_<uuid>'),
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().max(500).default(''),
        author: packAuthorSchema,
        createdAt: z.string().datetime(),
        packVersion: z
          .string()
          .trim()
          .min(1)
          .max(20)
          .regex(/^\d+\.\d+\.\d+$/, '包版本必须为 semver（如 1.0.0）'),
      })
      .strict(),
    contents: contentsSchema,
  })
  .strict();
export type WbfmPackManifest = z.infer<typeof packManifestSchema>;

/** mod 安装记录摘要（mod_installs.summary_json：各类型实际导入条目 id） */
export const modInstallSummarySchema = z.object({
  characterCardIds: z.array(z.string()).default([]),
  stageSceneIds: z.array(z.string()).default([]),
  stageBackgroundFileRefs: z.array(z.string()).default([]),
});
export type ModInstallSummary = z.infer<typeof modInstallSummarySchema>;

/** mod_installs 行记录（v031） */
export const modInstallRecordSchema = z
  .object({
    id: z.string().min(1),
    packId: z.string().min(1).max(80),
    name: z.string().min(1).max(80),
    packVersion: z.string().min(1).max(20),
    authorName: z.string().max(80).nullable(),
    importedAt: z.string().datetime(),
    summary: modInstallSummarySchema,
  })
  .strict();
export type ModInstallRecord = z.infer<typeof modInstallRecordSchema>;

/** 导出请求：勾选的自建条目 */
export const packExportRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).default(''),
    authorName: z.string().trim().min(1).max(80),
    authorUrl: z.string().trim().max(500).url().nullable().default(null),
    packVersion: z
      .string()
      .trim()
      .regex(/^\d+\.\d+\.\d+$/, '包版本必须为 semver')
      .default('1.0.0'),
    characterCardIds: z.array(z.string()).max(100).default([]),
    stageSceneIds: z.array(z.string()).max(50).default([]),
  })
  .refine(
    (v) => v.characterCardIds.length + v.stageSceneIds.length > 0,
    '至少选择一项内容导出',
  );
export type PackExportRequest = z.infer<typeof packExportRequestSchema>;
