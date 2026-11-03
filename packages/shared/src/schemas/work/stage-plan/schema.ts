import { z } from 'zod';
import { STAGE_PLAN_LIMITS, type StagePlan } from '../../../types/stage-plan';

/**
 * v2.20 阶段计划 Zod 契约。
 * 保存允许 goal 为空；prepare 时再要求非空。模型/技能存在性在 core 服务层查库校验。
 */

const skillNamesSchema = z
  .array(z.string().trim().min(1).max(256))
  .max(STAGE_PLAN_LIMITS.maxSkillsPerStage, `单个阶段最多 ${STAGE_PLAN_LIMITS.maxSkillsPerStage} 个技能`)
  .transform((names) => [...new Set(names)]);

export const stagePlanStepSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, '阶段标题不能为空')
    .max(STAGE_PLAN_LIMITS.maxTitleLength, `阶段标题最长 ${STAGE_PLAN_LIMITS.maxTitleLength} 字`),
  modelId: z.string().trim().min(1).nullable().default(null),
  skillNames: skillNamesSchema.default([]),
  goal: z.string().max(STAGE_PLAN_LIMITS.maxTextLength).default(''),
  deliverables: z.string().max(STAGE_PLAN_LIMITS.maxTextLength).default(''),
});
export type StagePlanStepInput = z.infer<typeof stagePlanStepSchema>;

export const stagePlanSchema = z
  .object({
    steps: z
      .array(stagePlanStepSchema)
      .min(1, '至少需要 1 个阶段')
      .max(STAGE_PLAN_LIMITS.maxStages, `最多 ${STAGE_PLAN_LIMITS.maxStages} 个阶段`),
    activeStep: z.number().int().min(0).nullable().default(null),
  })
  .superRefine((plan, ctx) => {
    if (plan.activeStep !== null && plan.activeStep >= plan.steps.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['activeStep'],
        message: 'activeStep 超出阶段范围',
      });
    }
  });
export type StagePlanInput = z.infer<typeof stagePlanSchema>;

export const stagePlanPrepareSchema = z.object({
  stepIndex: z.number().int().min(0),
});
export type StagePlanPrepareInput = z.infer<typeof stagePlanPrepareSchema>;

/** 保存返回（activeStep 变化时会话模型可能同步变化） */
export interface StagePlanSaveResult {
  plan: StagePlan;
  modelId: string | null;
}

export interface StagePlanPrepareResult {
  taskText: string;
  modelId: string | null;
  stepIndex: number;
}
