import { z } from 'zod';

/**
 * v1.9 舞台契约（M1 冻结，见 docs/plan/v1.9/02-cast与舞台协议.md）：
 * - 槽位固定左/中/右（M1 三角色）；
 * - 舞台只读消费 cast + StageDirection；
 * - stage_scenes 场景=背景+站位+cast 覆盖+显隐+滤镜。
 */

export const STAGE_SLOTS = ['left', 'center', 'right'] as const;
export type StageSlot = (typeof STAGE_SLOTS)[number];

/** 舞台指令允许的微动作分组 */
export const STAGE_MOTION_GROUPS = ['listening', 'thinking', 'working', 'idle'] as const;
export type StageMotionGroup = (typeof STAGE_MOTION_GROUPS)[number];

// ---------------------------------------------------------------------------
// cast（M1 mock cast 使用；M2 由 agent run 适配器产出）
// ---------------------------------------------------------------------------

export const stageCastMemberSchema = z.object({
  slot: z.enum(STAGE_SLOTS),
  kind: z.enum(['agent-role', 'assistant']),
  refId: z.string().trim().min(1),
  displayName: z.string().trim().min(1).max(40),
  avatarModelId: z.string().trim().min(1).max(80),
  expression: z.string().trim().min(1).max(40),
  actionLabelKey: z.string().trim().max(80).optional(),
  voicePreference: z
    .object({
      ttsModel: z.enum(['kokoro', 'melo']),
      speakerSid: z.number().int().min(0).max(102).nullable(),
    })
    .optional(),
});
export type StageCastMember = z.infer<typeof stageCastMemberSchema>;

export const stageDirectionSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('cast'), members: z.array(stageCastMemberSchema).max(3) }),
  z.object({ t: z.literal('focus'), slot: z.enum(STAGE_SLOTS).nullable() }),
  z.object({
    t: z.literal('speech'),
    slot: z.enum(STAGE_SLOTS),
    text: z.string().max(2000),
    seq: z.number().int().min(0),
  }),
  z.object({ t: z.literal('expression'), slot: z.enum(STAGE_SLOTS), tag: z.string().max(40) }),
  z.object({
    t: z.literal('motion'),
    slot: z.enum(STAGE_SLOTS),
    group: z.enum(STAGE_MOTION_GROUPS),
  }),
  z.object({ t: z.literal('exit'), slot: z.enum(STAGE_SLOTS) }),
]);
export type StageDirection = z.infer<typeof stageDirectionSchema>;

// ---------------------------------------------------------------------------
// 场景（stage_scenes.payload_json）
// ---------------------------------------------------------------------------

export const STAGE_NAME_MAX = 30;
/** 自定义背景图上限（概念稿 §2：≤20MB） */
export const STAGE_BACKGROUND_MAX_BYTES = 20 * 1024 * 1024;
export const STAGE_BACKGROUND_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, '必须是 #rrggbb 十六进制色值');

/** 单槽站位：x/y 为相对舞台的比例位置（0..1），scale 0.6–1.6 */
export const stageSlotPlacementSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().min(0.6).max(1.6),
});
export type StageSlotPlacement = z.infer<typeof stageSlotPlacementSchema>;

export const stageBackgroundSchema = z
  .object({
    type: z.enum(['solid', 'gradient', 'builtin', 'image']),
    /** solid/builtin 颜色；image 缺省时的兜底色 */
    color: hexColor.optional(),
    /** gradient 起止色与角度（0–360deg） */
    from: hexColor.optional(),
    to: hexColor.optional(),
    angle: z.number().min(0).max(360).optional(),
    /** builtin 渐变预设 id（web 侧注册表，不发图片资产） */
    builtinId: z.string().trim().max(40).optional(),
    /** image：数据目录 stage-backgrounds 下的服务端生成文件名 */
    fileRef: z.string().trim().max(120).optional(),
    /** 整体亮度 0.6–1.4 */
    brightness: z.number().min(0.6).max(1.4).default(1),
    /** 背景模糊 px（角色层不糊） */
    blur: z.number().min(0).max(20).default(0),
  })
  .strict();
export type StageBackground = z.infer<typeof stageBackgroundSchema>;

/** 2D「灯光」：暖色滤镜层不透明度 0–0.6 */
export const stageWarmFilterSchema = z
  .object({
    /** 滤镜颜色（默认暖橙），允许自定义为任意 hex */
    color: hexColor.default('#e8b06b'),
    opacity: z.number().min(0).max(0.6).default(0),
  })
  .strict();
export type StageWarmFilter = z.infer<typeof stageWarmFilterSchema>;

export const stageScenePayloadSchema = z
  .object({
    background: stageBackgroundSchema,
    /** 逐槽覆盖；缺省槽走 cast/全局形象 */
    slots: z
      .object({
        left: stageSlotPlacementSchema.optional(),
        center: stageSlotPlacementSchema.optional(),
        right: stageSlotPlacementSchema.optional(),
      })
      .strict(),
    /** 逐槽形象覆盖（avatar 注册表 id） */
    cast: z
      .object({
        left: z.string().trim().max(80).optional(),
        center: z.string().trim().max(80).optional(),
        right: z.string().trim().max(80).optional(),
      })
      .strict(),
    /** 画面整体缩放（Ctrl+滚轮，0.7–1.3） */
    sceneZoom: z.number().min(0.7).max(1.3).default(1),
    /** 对话框与名字牌显隐（H 键整体隐 UI 不写场景） */
    showDialog: z.boolean().default(true),
    showNameplates: z.boolean().default(true),
    warmFilter: stageWarmFilterSchema,
  })
  .strict();
export type StageScenePayload = z.infer<typeof stageScenePayloadSchema>;

/** 新建/更新入参 */
export const stageSceneCreateSchema = z.object({
  name: z.string().trim().min(1).max(STAGE_NAME_MAX),
  payload: stageScenePayloadSchema,
});
export type StageSceneCreateInput = z.infer<typeof stageSceneCreateSchema>;

export const stageSceneUpdateSchema = stageSceneCreateSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  '至少提交一个字段',
);
export type StageSceneUpdateInput = z.infer<typeof stageSceneUpdateSchema>;
