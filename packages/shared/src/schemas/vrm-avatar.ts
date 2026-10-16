import { z } from 'zod';

/**
 * v2.0 M4 VRM 形象契约
 * 记录表 vrm_avatars（v030）与导入/展示载荷。
 */

/** VRM 内嵌 meta 许可信息（从 GLB JSON chunk 提取） */
export const vrmMetaSchema = z.object({
  /** 模型名称（meta.name） */
  name: z.string().trim().max(80).optional(),
  /** 作者（meta.author） */
  author: z.string().trim().max(80).optional(),
  /** 版权信息（meta.copyright） */
  copyright: z.string().trim().max(200).optional(),
  /** 许可 URL（meta.licenseUrl） */
  licenseUrl: z.string().trim().max(500).optional(),
  /** 演绎者范围（meta.avatarPermission） */
  avatarPermission: z.string().trim().max(40).optional(),
  /** 商用许可（meta.commercialUsage） */
  commercialUsage: z.string().trim().max(40).optional(),
  /** 暴力表现许可（meta.violentUsage） */
  violentUsage: z.string().trim().max(40).optional(),
  /** 性表现许可（meta.sexualUsage） */
  sexualUsage: z.string().trim().max(40).optional(),
  /** 再分发许可（meta.redistribution） */
  redistribution: z.string().trim().max(40).optional(),
  /** VRM 规范版本（0.x / 1.0） */
  vrmVersion: z.enum(['0.x', '1.0']).optional(),
});
export type VrmMeta = z.infer<typeof vrmMetaSchema>;

/** VRM 形象记录（数据库行 + API 返回） */
export const vrmAvatarSchema = z.object({
  id: z.string().trim().min(1).max(80),
  /** 用户可见名称（缺省取 meta.name，再缺省取文件名） */
  name: z.string().trim().min(1).max(80),
  /** 存储文件名（vrm-<uuid>.vrm） */
  fileRef: z.string().trim().min(1).max(120),
  /** 文件字节数 */
  byteLength: z.number().int().min(1),
  /** 内嵌 meta 许可信息 */
  meta: vrmMetaSchema,
  createdAt: z.string().datetime(),
});
export type VrmAvatar = z.infer<typeof vrmAvatarSchema>;

/** POST /api/vrm-avatars 上传响应 */
export const vrmAvatarUploadResponseSchema = z.object({
  avatar: vrmAvatarSchema,
});
export type VrmAvatarUploadResponse = z.infer<typeof vrmAvatarUploadResponseSchema>;

/** GET /api/vrm-avatars 列表响应 */
export const vrmAvatarListResponseSchema = z.object({
  avatars: z.array(vrmAvatarSchema),
});
export type VrmAvatarListResponse = z.infer<typeof vrmAvatarListResponseSchema>;

/** 从 avatarModelId 解析 VRM fileRef；非 VRM 返回 null */
export function parseVrmAvatarId(modelId: string | null | undefined): string | null {
  if (!modelId || !modelId.startsWith('vrm:')) return null;
  const ref = modelId.slice(4).trim();
  return ref.length > 0 ? ref : null;
}

/** 判断 avatarModelId 是否为 VRM 形象 */
export function isVrmAvatarId(modelId: string | null | undefined): boolean {
  return parseVrmAvatarId(modelId) !== null;
}

/** 组装 VRM avatarModelId */
export function buildVrmAvatarId(fileRef: string): string {
  return `vrm:${fileRef}`;
}
