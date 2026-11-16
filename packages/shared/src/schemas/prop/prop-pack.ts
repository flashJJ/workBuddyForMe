/**
 * v4.3 M3：道具包 payload。
 *
 * 资源随包放在 payload 目录下的 .glb 文件，由能力包目录读取；
 * id 强制 `pack.` 前缀，与内置道具命名空间隔离。
 */

import { z } from 'zod';

export const PROP_PACK_KINDS = ['hand', 'stage'] as const;
export type PropPackKind = (typeof PROP_PACK_KINDS)[number];

export const PROP_PACK_LICENSES = ['CC0-1.0', 'CC-BY-4.0'] as const;
export type PropPackLicense = (typeof PROP_PACK_LICENSES)[number];

export const PROP_PACK_ID_PREFIX = 'pack.';
export const PROP_PACK_MAX_PROPS = 20;
/** 单个 GLB 资源上限 5MB */
export const PROP_PACK_MAX_ASSET_BYTES = 5 * 1024 * 1024;
/** 整包资源合计上限 20MB */
export const PROP_PACK_MAX_TOTAL_BYTES = 20 * 1024 * 1024;

const positionSchema = z.tuple([z.number(), z.number(), z.number()]);

export const propPackPropSchema = z
  .object({
    id: z
      .string()
      .trim()
      .max(80)
      .regex(/^pack\.[a-z0-9][a-z0-9._-]*$/, '道具 id 必须形如 pack.<小写字母/数字>'),
    kind: z.enum(PROP_PACK_KINDS),
    file: z
      .string()
      .trim()
      .regex(/^payload\/[a-zA-Z0-9._/-]+\.glb$/, 'file 必须是 payload/ 下的 .glb'),
    license: z.enum(PROP_PACK_LICENSES),
    contact: z.number().min(0).max(0.5).optional(),
    lateral: z.number().min(-0.5).max(0.5).optional(),
    handPose: z.literal('pose.prop-hold').optional(),
    scale: z.number().min(0.05).max(10).optional(),
    yaw: z.number().min(-Math.PI * 2).max(Math.PI * 2).optional(),
    position: positionSchema.optional(),
    rotationY: z.number().min(-Math.PI * 2).max(Math.PI * 2).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'hand') {
      if (value.position || value.rotationY !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pos'],
          message: '手持道具不能声明 position/rotationY',
        });
      }
      return;
    }
    if (
      value.contact !== undefined ||
      value.lateral !== undefined ||
      value.handPose !== undefined ||
      value.yaw !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['kind'],
        message: '场景道具不能声明 contact/lateral/handPose/yaw',
      });
    }
  });

export const propPackPayloadSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(200).default(''),
    props: z
      .array(propPackPropSchema)
      .min(1, '至少包含 1 个道具')
      .max(PROP_PACK_MAX_PROPS, `最多 ${PROP_PACK_MAX_PROPS} 个道具`),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.props.forEach((prop, index) => {
      if (seen.has(prop.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['props', index, 'id'],
          message: `道具 id 重复：${prop.id}`,
        });
      }
      seen.add(prop.id);
    });
  });

export type PropPackProp = z.infer<typeof propPackPropSchema>;
export type PropPackPayload = z.infer<typeof propPackPayloadSchema>;
