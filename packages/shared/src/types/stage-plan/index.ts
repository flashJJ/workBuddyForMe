/**
 * v2.20 M4 阶段计划契约：会话内 1–8 个阶段，阶段可绑定模型/技能/目标/交付要求。
 * 纯类型与上限常量；Zod 校验在 schemas/work/stage-plan.ts。
 */
export const STAGE_PLAN_LIMITS = {
  maxStages: 8,
  maxTitleLength: 40,
  maxSkillsPerStage: 12,
  maxTextLength: 4000,
} as const;

export interface StagePlanStep {
  title: string;
  /** models.id；null=清除会话覆盖，回落助手/系统默认 */
  modelId: string | null;
  skillNames: string[];
  goal: string;
  deliverables: string;
}

export interface StagePlan {
  steps: StagePlanStep[];
  /** 0-based；null=未选择 */
  activeStep: number | null;
}
