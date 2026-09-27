import { z } from 'zod';

/**
 * v0.6 M2：HITL 工具确认 API 契约。
 * orchestrator 挂起未授权的 write/danger 工具调用后，前端通过
 * POST /api/tools/confirm 提交用户决策（超时/中断服务端自动 deny）。
 */
export const toolConfirmSchema = z
  .object({
    callId: z.string().trim().min(1).max(128),
    tool: z.string().trim().min(1).max(200),
    action: z.enum(['allow', 'deny']),
    /** 授权记忆范围：assistant=仅当前助手，all=全局；缺省仅本次生效 */
    remember: z.enum(['assistant', 'all']).optional(),
    /** remember='assistant' 时必填 */
    assistantId: z.string().trim().min(1).max(64).optional(),
  })
  .refine((v) => v.remember !== 'assistant' || Boolean(v.assistantId), {
    message: 'remember=assistant 时必须提供 assistantId',
    path: ['assistantId'],
  });
export type ToolConfirmInput = z.infer<typeof toolConfirmSchema>;
