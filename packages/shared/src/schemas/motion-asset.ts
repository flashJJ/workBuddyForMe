import { z } from 'zod';
import { relationshipLevelSchema } from './relationship';

/**
 * v2.0 待机动作（VRMA）契约
 * 记录表 motion_assets（v032）与导入/展示载荷。
 *
 * v2.2 增补（M0 冻结）：动作段与情绪档位。二者都是**策略层**维度，
 * 2D Live2D 与 3D VRM 两套渲染后端共用同一份契约与挑选策略，
 * 差异只在「候选集从哪来」（见 docs/plan/v2.2/README.md 第 2 节）。
 */

// ── v2.2 动作段（对齐开源桌宠模拟器 VPet 的 AnimatType） ──────────

/**
 * 动作段：
 * - `single` 整段即一个动作（既是入场也是循环段）——单段 VRMA 的缺省值；
 * - `a_start` / `b_loop` / `c_end` 入场 / 循环 / 退场三段。
 *
 * 缺段时按顺序退化为「整段即循环段」（缺 A 直接进 B，缺 C 直接回待机），
 * 因此**导入侧不强制用户拆段**——拆段是可选标注能力。
 */
export const MOTION_SEGMENTS = ['single', 'a_start', 'b_loop', 'c_end'] as const;
export const motionSegmentSchema = z.enum(MOTION_SEGMENTS);
export type MotionSegment = z.infer<typeof motionSegmentSchema>;
export const DEFAULT_MOTION_SEGMENT: MotionSegment = 'single';

/** 动作条目的段优先级：取条目属性（档位/门槛）时优先看循环段 */
export const MOTION_SEGMENT_PRIORITY = ['b_loop', 'single', 'a_start', 'c_end'] as const;

// ── v2.2 情绪档位（策略层，两后端共用） ────────────────────────

/**
 * 情绪档位：`good` 活跃 → `normal` 中性 → `low` 安静。
 * 挑选时按「精确 → 更差档位 → 更好档位 → 任意」回退（对齐 VPet 的 ModeType 兼容顺序），
 * 因此动作不必每个档位都备齐；`normal` 是缺省档位，也是最终兜底。
 */
export const MOTION_MOODS = ['good', 'normal', 'low'] as const;
export const motionMoodSchema = z.enum(MOTION_MOODS);
export type MotionMood = z.infer<typeof motionMoodSchema>;
export const DEFAULT_MOTION_MOOD: MotionMood = 'normal';

/** 动作条目键长度上限 */
export const MOTION_ENTRY_KEY_MAX = 80;

// ── 记录与载荷 ──────────────────────────────────────────

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
  /**
   * v2.2 动作条目键：同键的多个 clip 组成一个三段式动作；
   * 缺省（null/undefined）表示该 clip 自成条目。同键各行的档位/门槛应写相同值。
   */
  entryKey: z.string().trim().min(1).max(MOTION_ENTRY_KEY_MAX).nullable().optional(),
  /** v2.2 段标记（缺省 single） */
  segment: motionSegmentSchema.default(DEFAULT_MOTION_SEGMENT),
  /** v2.2 情绪档位（缺省 normal） */
  mood: motionMoodSchema.default(DEFAULT_MOTION_MOOD),
  /** v2.2 最低关系等级门槛（0 陌生 / 1 认识 / 2 搭档 / 3 挚友）；null = 无门槛 */
  minRelationshipLevel: relationshipLevelSchema.nullable().optional(),
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
