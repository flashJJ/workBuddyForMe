import { z } from 'zod';

/**
 * v2.0 待机动作（VRMA）契约
 * 记录表 motion_assets（v032）与导入/展示载荷。
 */

/** 待机动作记录（数据库行 + API 返回） */
export const motionAssetSchema = z.object({
  id: z.string().trim().min(1).max(80),
  /** 用户可见名称（缺省取文件名） */
  name: z.string().trim().min(1).max(80),
  /** 存储文件名（motion-<uuid>.vrma） */
  fileRef: z.string().trim().min(1).max(120),
  /** 文件字节数 */
  byteLength: z.number().int().min(1),
  /** 来源备注（可选） */
  source: z.string().trim().max(200).optional(),
  /** 备注（可选） */
  note: z.string().trim().max(200).optional(),
  createdAt: z.string().datetime(),
});
export type MotionAsset = z.infer<typeof motionAssetSchema>;

/** POST /api/motions 上传响应 */
export const motionAssetUploadResponseSchema = z.object({
  motion: motionAssetSchema,
});
export type MotionAssetUploadResponse = z.infer<typeof motionAssetUploadResponseSchema>;

/** GET /api/motions 列表响应（多带当前选中的 idleMotionId） */
export const motionAssetListResponseSchema = z.object({
  motions: z.array(motionAssetSchema),
  selectedId: z.string().nullable(),
});
export type MotionAssetListResponse = z.infer<typeof motionAssetListResponseSchema>;

/** 从 idleMotionId 解析 VRMA fileRef；内置默认（null/builtin）返回 null */
export function parseMotionId(id: string | null | undefined): string | null {
  if (!id || !id.startsWith('motion:')) return null;
  const ref = id.slice('motion:'.length).trim();
  return ref.length > 0 ? ref : null;
}

/** 判断 idleMotionId 是否为用户导入的待机动作 */
export function isMotionId(id: string | null | undefined): boolean {
  return parseMotionId(id) !== null;
}

/** 组装 idleMotionId */
export function buildMotionId(fileRef: string): string {
  return `motion:${fileRef}`;
}
