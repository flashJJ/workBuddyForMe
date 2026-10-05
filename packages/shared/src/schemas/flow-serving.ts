import { z } from 'zod';
import { FLOW_UNATTENDED_POLICY_MODES } from '../types/flow';

/**
 * v0.9 Flow Serving 契约：对外端点配置与无人值守策略。
 * 公开 invoke 的请求体就是 start 入参记录，直接复用 flowRunCreateSchema.input（Record），
 * start 字段级校验由服务端读发布图的 flowStartConfigSchema 完成。
 */

export const FLOW_ENDPOINT_SYNC_TIMEOUT = { min: 5_000, max: 120_000, default: 60_000 } as const;
export const FLOW_ENDPOINT_RATE_LIMIT = { min: 1, max: 600, default: 30 } as const;

/** 桌面控制类工具：任何无人值守策略都不允许自动放行（需有人链路操作） */
export const FLOW_DESKTOP_CONTROL_TOOLS = [
  'screen_snapshot',
  'mouse_move',
  'mouse_click',
  'mouse_scroll',
  'keyboard_type',
  'keyboard_press',
  'window_list',
  'window_focus',
  'uia_list',
  'app_launch',
] as const;

const toolNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9:_-]+$/, '工具名仅允许字母数字、冒号、下划线、中划线');

export const flowUnattendedPolicySchema = z
  .object({
    mode: z.enum(FLOW_UNATTENDED_POLICY_MODES),
    allowed: z.array(toolNameSchema).max(50).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'allowlist') {
      if (!value.allowed || value.allowed.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '白名单模式至少声明 1 个工具；全部拒绝请使用 deny_all',
          path: ['allowed'],
        });
      }
      const banned = (value.allowed ?? []).filter((name) =>
        (FLOW_DESKTOP_CONTROL_TOOLS as readonly string[]).includes(name),
      );
      if (banned.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `桌面控制工具不允许无人值守自动授权：${banned.join('、')}`,
          path: ['allowed'],
        });
      }
    }
  })
  .transform((value) =>
    value.mode === 'deny_all'
      ? { mode: 'deny_all' as const }
      : { mode: 'allowlist' as const, allowed: Array.from(new Set(value.allowed ?? [])) },
  );

/** 端点创建（首次开启暴露时）/ 更新配置 */
export const flowEndpointUpsertSchema = z.object({
  httpEnabled: z.boolean().default(false),
  mcpEnabled: z.boolean().default(false),
  syncTimeoutMs: z
    .number()
    .int()
    .min(FLOW_ENDPOINT_SYNC_TIMEOUT.min)
    .max(FLOW_ENDPOINT_SYNC_TIMEOUT.max)
    .default(FLOW_ENDPOINT_SYNC_TIMEOUT.default),
  rateLimitPerMin: z
    .number()
    .int()
    .min(FLOW_ENDPOINT_RATE_LIMIT.min)
    .max(FLOW_ENDPOINT_RATE_LIMIT.max)
    .default(FLOW_ENDPOINT_RATE_LIMIT.default),
  policy: flowUnattendedPolicySchema.default({ mode: 'deny_all' }),
});
export type FlowEndpointUpsertInput = z.infer<typeof flowEndpointUpsertSchema>;

/** 启用/停用开关（单独接口的窄 schema） */
export const flowEndpointStatusSchema = z.object({
  status: z.enum(['enabled', 'disabled']),
});
