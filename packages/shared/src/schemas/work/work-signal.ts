import { z } from 'zod';

/** v2.7：审批中心一次性允许/拒绝（values 仅人工节点使用） */
export const approvalDecisionSchema = z.object({
  action: z.enum(['allow', 'deny']),
  values: z.record(z.unknown()).optional(),
});
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;
