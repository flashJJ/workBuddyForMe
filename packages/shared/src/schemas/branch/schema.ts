import { z } from 'zod';
import {
  BRANCH_LIMIT_RANGES,
  BRANCH_STATUSES,
  type BranchLimits,
} from '../../types/branch';

/** v2.21：分支创建/更新与回传 evidence 契约；模型与预算校验在 core 服务层。 */

export const branchStatusSchema = z.enum(BRANCH_STATUSES);

export const branchCreateSchema = z.object({
  title: z.string().trim().min(1).max(40).optional(),
  goal: z.string().trim().min(1).max(4000),
  autoStart: z.boolean().optional(),
});

export const branchUpdateSchema = z.object({
  title: z.string().trim().min(1).max(40),
});

export const branchArtifactRefSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200),
  kind: z.string().min(1).max(40),
});

export const branchEvidenceSchema = z.object({
  branchId: z.string().min(1),
  parentConversationId: z.string().min(1),
  childConversationId: z.string().min(1),
  rootConversationId: z.string().min(1),
  status: branchStatusSchema,
  summary: z.string().max(4000),
  artifacts: z.array(branchArtifactRefSchema).max(50).default([]),
  usage: z
    .object({
      promptTokens: z.number().int().min(0),
      completionTokens: z.number().int().min(0),
      totalTokens: z.number().int().min(0),
    })
    .nullable()
    .default(null),
  needsReview: z.literal(true),
  createdAt: z.string().datetime(),
});

const limitInt = (key: keyof BranchLimits) =>
  z
    .number()
    .int()
    .min(BRANCH_LIMIT_RANGES[key].min)
    .max(BRANCH_LIMIT_RANGES[key].max);

export const branchLimitsSchema: z.ZodType<BranchLimits> = z.object({
  maxConcurrent: limitInt('maxConcurrent'),
  maxDepth: limitInt('maxDepth'),
  maxChildren: limitInt('maxChildren'),
  maxTreeTokens: limitInt('maxTreeTokens'),
});

export interface BranchCreateInput {
  title?: string;
  goal: string;
  autoStart?: boolean;
}
