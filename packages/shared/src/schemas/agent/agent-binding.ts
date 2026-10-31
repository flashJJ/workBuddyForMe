import { z } from 'zod';

/** v2.13 M2：审批绑定——批准的是「这一次具体操作」，执行前重新计算并比对 */

export const operationBindingSchema = z.object({
  tool: z.string().trim().min(1).max(120),
  argsHash: z.string().length(64),
  cwd: z.string().trim().min(1).max(500).optional(),
  envHash: z.string().length(64).optional(),
  fileOperands: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  target: z
    .object({
      windowId: z.string().max(160).optional(),
      processName: z.string().max(160).optional(),
    })
    .optional(),
  policyHash: z.string().length(64).optional(),
});

export type OperationBinding = z.infer<typeof operationBindingSchema>;

/** 审批中心展示用摘要（不含完整参数 / 环境变量） */
export interface ApprovalBindingSummary {
  tool: string;
  argsSummary: string;
  cwd: string | null;
  target: string | null;
  policyReason: string | null;
}
