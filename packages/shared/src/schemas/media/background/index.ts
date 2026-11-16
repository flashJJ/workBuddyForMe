/**
 * v4.4 M1：背景与壁纸设置契约。
 *
 * 背景源只描述「去哪取资源」，不存绝对路径：内置用固定 id，
 * 用户文件与能力包资源都用 id 索引；实际读取在各端完成。
 */

import { z } from 'zod';

export const BACKGROUND_SOURCE_KINDS = ['builtin', 'image', 'video'] as const;
export type BackgroundSourceKind = (typeof BACKGROUND_SOURCE_KINDS)[number];

export const BACKGROUND_SCOPES = ['main', 'stage', 'pet'] as const;
export type BackgroundScope = (typeof BACKGROUND_SCOPES)[number];

export const BACKGROUND_FITS = ['cover', 'contain'] as const;
export type BackgroundFit = (typeof BACKGROUND_FITS)[number];

export const BACKGROUND_MAIN_MODES = ['chat', 'window'] as const;
export type BackgroundMainMode = (typeof BACKGROUND_MAIN_MODES)[number];

/** 内置背景：none 保持透明/主题底色；其余为随包资源或程序化渐变 */
export const BUILTIN_BACKGROUND_IDS = [
  'none',
  'wallpaper.rainy-room',
  'wallpaper.dusk',
  'wallpaper.morning',
] as const;
export type BuiltinBackgroundId = (typeof BUILTIN_BACKGROUND_IDS)[number];

export const BACKGROUND_DIM_MAX = 1;
export const BACKGROUND_BLUR_MAX = 20;

const sourceIdSchema = z.string().trim().min(1).max(120);
/** 内置 id：none、固定内置项或生成图集（wallpaper.gallery.NN） */
const builtinIdSchema = z.string().trim().regex(/^(none|wallpaper\.[a-z0-9][a-z0-9._-]*)$/);

export const backgroundSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('builtin'), id: builtinIdSchema }),
  z.object({ kind: z.literal('image'), id: sourceIdSchema }),
  z.object({ kind: z.literal('video'), id: sourceIdSchema }),
]);

export type BackgroundSource = z.infer<typeof backgroundSourceSchema>;

const configFields = {
  source: backgroundSourceSchema,
  fit: z.enum(BACKGROUND_FITS),
  dim: z.number().min(0).max(BACKGROUND_DIM_MAX),
  blur: z.number().min(0).max(BACKGROUND_BLUR_MAX),
};

/** 完整配置（读取后归一化使用） */
export const backgroundConfigSchema = z.object(configFields);
export type BackgroundConfig = z.infer<typeof backgroundConfigSchema>;

/** 设置写入：每个字段都可缺省，服务端按已有值合并 */
export const backgroundConfigUpdateSchema = z.object({
  source: backgroundSourceSchema.optional(),
  fit: z.enum(BACKGROUND_FITS).optional(),
  dim: z.number().min(0).max(BACKGROUND_DIM_MAX).optional(),
  blur: z.number().min(0).max(BACKGROUND_BLUR_MAX).optional(),
});
export type BackgroundConfigUpdate = z.infer<typeof backgroundConfigUpdateSchema>;

/** 主窗口额外有聊天/整屏互斥模式；其他作用域不允许出现 mode */
export const mainBackgroundConfigUpdateSchema = backgroundConfigUpdateSchema.extend({
  mode: z.enum(BACKGROUND_MAIN_MODES).optional(),
});
export type MainBackgroundConfigUpdate = z.infer<typeof mainBackgroundConfigUpdateSchema>;

export const backgroundSettingsUpdateSchema = z.object({
  main: mainBackgroundConfigUpdateSchema.optional(),
  stage: backgroundConfigUpdateSchema.optional(),
  pet: backgroundConfigUpdateSchema.optional(),
});
export type BackgroundSettingsUpdate = z.infer<typeof backgroundSettingsUpdateSchema>;

export const DEFAULT_BACKGROUND_CONFIG: BackgroundConfig = {
  source: { kind: 'builtin', id: 'wallpaper.rainy-room' },
  fit: 'cover',
  dim: 0.15,
  blur: 0,
};

/** 桌宠默认保持透明，不跟随其他作用域 */
export const DEFAULT_PET_BACKGROUND: BackgroundConfig = {
  ...DEFAULT_BACKGROUND_CONFIG,
  source: { kind: 'builtin', id: 'none' },
  dim: 0,
};

export const DEFAULT_BACKGROUND_SETTINGS: Record<BackgroundScope, BackgroundConfig> = {
  main: DEFAULT_BACKGROUND_CONFIG,
  // 舞台保持原有剧集背景；用户显式选择后才接管底层
  stage: { ...DEFAULT_BACKGROUND_CONFIG, source: { kind: 'builtin', id: 'none' }, dim: 0 },
  pet: DEFAULT_PET_BACKGROUND,
};

/** 是否为主窗口的聊天模式（缺省聊天） */
export function isChatMode(mode: BackgroundMainMode | undefined): boolean {
  return mode !== 'window';
}

export * from './wallpaper-pack';
