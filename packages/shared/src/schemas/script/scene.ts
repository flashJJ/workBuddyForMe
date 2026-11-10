/**
 * v3.0 剧本引擎：Scene / Beat 契约。
 *
 * 一场戏 = 触发键 + 优先级 + 冷却 + 门控 + 相对时间轴（beats）。
 * beat 的轨道由 cue 的 kind 推导（cueTrack），避免 track 与 cue 两处声明漂移；
 * beat 必须按 at 升序，保证 Director 单时钟顺序推进。
 */

import { z } from 'zod';
import { cueSchema, type Cue } from './cues';
import { conditionSchema } from './conditions';

/** 轨道：body / world 独占，其余可并行（09 文档 §2） */
export const SCRIPT_TRACKS = ['body', 'face', 'look', 'voice', 'ui', 'world'] as const;
export type ScriptTrack = (typeof SCRIPT_TRACKS)[number];

export const EXCLUSIVE_TRACKS: ReadonlySet<ScriptTrack> = new Set(['body', 'world']);

/** Cue → 所属轨道；wait / branch 不占轨道（返回 null） */
export function cueTrack(cue: Cue): ScriptTrack | null {
  switch (cue.kind) {
    case 'pose':
    case 'gesture':
    case 'motion':
      return 'body';
    case 'expression':
      return 'face';
    case 'look':
      return 'look';
    case 'line':
    case 'speak':
    case 'sound':
      return 'voice';
    case 'effect':
      return 'ui';
    case 'move':
    case 'emit':
      return 'world';
    case 'wait':
    case 'branch':
      return null;
  }
}

/** 优先级：沿用 04 —— 0 拖拽/落地，1 触摸反应，2 环境行为，3 待机/呼吸 */
export const SCENE_PRIORITIES = [0, 1, 2, 3] as const;
export type ScenePriority = (typeof SCENE_PRIORITIES)[number];
export const DEFAULT_SCENE_PRIORITY: ScenePriority = 2;

/** 抢占策略：all = 更高优先级可打断；never = 不可被抢占（落地 / 久别） */
export const SCENE_INTERRUPT_POLICIES = ['all', 'never'] as const;
export type SceneInterruptPolicy = (typeof SCENE_INTERRUPT_POLICIES)[number];

/** 单场最长 10 分钟（超时视为配置错误，防止 at 写错把场景挂死） */
export const BEAT_MAX_MS = 10 * 60 * 1000;

export interface Beat {
  /** 相对场景开始的毫秒 */
  at: number;
  cue: Cue;
}

const idSchema = z.string().trim().min(1).max(80);

export const beatSchema: z.ZodType<Beat> = z.object({
  at: z.number().int().min(0).max(BEAT_MAX_MS),
  cue: cueSchema,
});

/** beats 数组：非空 + at 升序（允许同一时刻多个 cue） */
export const beatsSchema = z
  .array(beatSchema)
  .min(1)
  .superRefine((beats, ctx) => {
    beats.forEach((beat, index) => {
      const previous = beats[index - 1]?.at ?? -1;
      if (beat.at < previous) {
        ctx.addIssue({ code: 'custom', path: [index, 'at'], message: 'beats 需按 at 升序排列' });
      }
    });
  });

export const sceneSchema = z.object({
  id: idSchema,
  /** 触发键（口径同 interaction 的 eventTriggerKey；空 = 仅手动播放） */
  triggers: z.array(z.string().trim().min(1).max(80)).default([]),
  priority: z
    .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
    .default(DEFAULT_SCENE_PRIORITY),
  cooldownMs: z.number().int().min(0).max(3_600_000).default(0),
  interrupt: z.enum(SCENE_INTERRUPT_POLICIES).default('all'),
  /** 播放前门控（满足才可入场；冷却与优先级由 Director 另算） */
  gating: conditionSchema.optional(),
  beats: beatsSchema,
});

export type Scene = z.infer<typeof sceneSchema>;
