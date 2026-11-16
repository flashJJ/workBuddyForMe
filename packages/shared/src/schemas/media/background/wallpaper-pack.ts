/**
 * v4.4 M3：wallpaper-pack payload。
 *
 * 背景资源随包放在 payload 目录下；id 强制 `wallpaper.` 前缀，
 * 与内置背景和用户本地文件命名空间隔离。
 */

import { z } from 'zod';

export const WALLPAPER_PACK_KINDS = ['image', 'video'] as const;
export type WallpaperPackKind = (typeof WALLPAPER_PACK_KINDS)[number];

export const WALLPAPER_PACK_LICENSES = ['CC0-1.0', 'CC-BY-4.0'] as const;
export type WallpaperPackLicense = (typeof WALLPAPER_PACK_LICENSES)[number];

export const WALLPAPER_PACK_ID_PREFIX = 'wallpaper.';
export const WALLPAPER_PACK_MAX_ITEMS = 10;
export const WALLPAPER_PACK_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const WALLPAPER_PACK_MAX_TOTAL_BYTES = 200 * 1024 * 1024;

const FILE_RE = /^payload\/[a-zA-Z0-9._/-]+\.(png|jpg|jpeg|webp|mp4)$/;
const IMAGE_RE = /\.(png|jpg|jpeg|webp)$/i;
const VIDEO_RE = /\.mp4$/i;

export const wallpaperPackItemSchema = z
  .object({
    id: z
      .string()
      .trim()
      .max(80)
      .regex(/^wallpaper\.[a-z0-9][a-z0-9._-]*$/, '背景 id 必须形如 wallpaper.<小写字母/数字>'),
    kind: z.enum(WALLPAPER_PACK_KINDS),
    file: z.string().trim().regex(FILE_RE, 'file 必须是 payload/ 下的图片或 .mp4'),
    license: z.enum(WALLPAPER_PACK_LICENSES),
  })
  .superRefine((value, ctx) => {
    const pattern = value.kind === 'video' ? VIDEO_RE : IMAGE_RE;
    if (!pattern.test(value.file)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['file'],
        message: value.kind === 'video' ? '视频背景只接受 .mp4' : '图片背景只接受 png/jpg/webp',
      });
    }
  });

export type WallpaperPackItem = z.infer<typeof wallpaperPackItemSchema>;

export const wallpaperPackPayloadSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(200).default(''),
    backgrounds: z
      .array(wallpaperPackItemSchema)
      .min(1, '至少包含 1 个背景')
      .max(WALLPAPER_PACK_MAX_ITEMS, `最多 ${WALLPAPER_PACK_MAX_ITEMS} 个背景`),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.backgrounds.forEach((item, index) => {
      if (seen.has(item.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['backgrounds', index, 'id'],
          message: `背景 id 重复：${item.id}`,
        });
      }
      seen.add(item.id);
    });
  });

export type WallpaperPackPayload = z.infer<typeof wallpaperPackPayloadSchema>;
