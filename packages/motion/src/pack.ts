import { z } from 'zod';
import { EXPRESSION_TAGS, SCRIPT_LOOK_TARGETS } from '@wbfm/shared/schemas';

/**
 * v4.0 M3：motion-pack payload（payload/motion-pack.json）。
 * 只允许数据，不允许执行器代码；安装侧 fail-closed 校验。
 */

const boneGroupSchema = z.enum([
  'root',
  'spine',
  'head',
  'leftArm',
  'rightArm',
  'leftLeg',
  'rightLeg',
  'face',
]);

const boneMaskSchema = z
  .object({
    include: z.array(boneGroupSchema).max(8),
    exclude: z.array(boneGroupSchema).max(8).optional(),
  })
  .strict();

const boneRotationSchema = z
  .object({
    x: z.number().optional(),
    y: z.number().optional(),
    z: z.number().optional(),
  })
  .strict();

const poseSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    mask: boneMaskSchema,
    bones: z.record(boneRotationSchema),
    variants: z
      .array(z.object({ bones: z.record(boneRotationSchema) }).strict())
      .max(8)
      .optional(),
    additive: z.boolean().optional(),
  })
  .strict();

const easingSchema = z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']);

const motionSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    durationMs: z.number().positive().max(60_000),
    loop: z.boolean().optional(),
    keys: z
      .array(
        z
          .object({
            at: z.number().min(0).max(60_000),
            pose: z.string().trim().min(1).max(80),
            easing: easingSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(64),
  })
  .strict();

const trackSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('pose'),
      mask: boneMaskSchema,
      pose: z.string().trim().min(1).max(80),
      weight: z.number().min(0).max(1).optional(),
      fadeMs: z.number().min(0).max(10_000).optional(),
      phaseOffset: z.number().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('motion'),
      mask: boneMaskSchema,
      motion: z.string().trim().min(1).max(80),
      weight: z.number().min(0).max(1).optional(),
      at: z.number().min(0).max(60_000).optional(),
    })
    .strict(),
  z
    .object({ kind: z.literal('root'), motion: z.string().trim().min(1).max(80) })
    .strict(),
  z
    .object({
      kind: z.literal('expression'),
      tag: z.enum(EXPRESSION_TAGS),
      holdMs: z.number().min(0).max(60_000).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('look'),
      target: z.enum(SCRIPT_LOOK_TARGETS),
      weight: z.number().min(0).max(1).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('morph'),
      channels: z.record(z.number().min(0).max(1)),
      weight: z.number().min(0).max(1).optional(),
    })
    .strict(),
]);

const phaseSchema = z
  .object({
    durationMs: z.number().min(0).max(60_000).optional(),
    fadeMs: z.number().min(0).max(10_000).optional(),
    tracks: z.array(trackSchema).min(1).max(16),
  })
  .strict();

const behaviorSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    interrupt: z.enum(['all', 'never']),
    enter: phaseSchema.optional(),
    loop: phaseSchema.optional(),
    exit: phaseSchema.optional(),
  })
  .strict();

export const motionPackPayloadSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(200).default(''),
    poses: z.array(poseSchema).max(64).default([]),
    motions: z.array(motionSchema).max(64).default([]),
    behaviors: z.array(behaviorSchema).max(32).default([]),
  })
  .strict()
  .refine(
    (value) => value.poses.length + value.motions.length + value.behaviors.length > 0,
    { message: '至少包含一个姿势、动作或行为' },
  );

export type MotionPackPayload = z.infer<typeof motionPackPayloadSchema>;
export type MotionPackPose = z.infer<typeof poseSchema>;
export type MotionPackMotion = z.infer<typeof motionSchema>;
export type MotionPackBehavior = z.infer<typeof behaviorSchema>;
