import { ApiError } from '@wbfm/shared/errors';
import { type StagePlan, type StagePlanStep } from '@wbfm/shared/types';
import {
  stagePlanSchema,
  type StagePlanPrepareResult,
  type StagePlanSaveResult,
} from '@wbfm/shared/schemas';
import {
  createConversationRepository,
  createModelRepository,
  createStagePlanRepository,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/base/deps';

export interface StagePlanService {
  get(conversationId: string): StagePlan | null;
  save(conversationId: string, input: unknown): StagePlanSaveResult;
  prepare(conversationId: string, stepIndex: number): StagePlanPrepareResult;
}

interface SkillEntry {
  name: string;
  sourcePath: string;
  available: boolean;
}

function skillEntries(deps: Pick<ServiceDeps, 'skills'>): Map<string, SkillEntry> {
  const map = new Map<string, SkillEntry>();
  for (const skill of deps.skills?.list() ?? []) {
    map.set(skill.name, {
      name: skill.name,
      sourcePath: skill.sourcePath,
      available: skill.enabled && skill.exists && skill.manifest !== null,
    });
  }
  return map;
}

/** 阶段绑定的模型/技能存在性校验；保存与助手默认阶段复用。 */
export function validateStagePlanBindings(
  deps: Pick<ServiceDeps, 'db' | 'skills'>,
  plan: StagePlan,
): void {
  const models = createModelRepository(deps.db);
  for (const step of plan.steps) {
    if (step.modelId !== null) {
      const model = models.findById(step.modelId);
      if (!model) {
        throw ApiError.validation(`阶段「${step.title}」绑定的模型不存在：${step.modelId}`);
      }
      if (!model.capabilities.includes('chat')) {
        throw ApiError.validation(`阶段「${step.title}」绑定的模型不支持对话：${model.displayName}`);
      }
    }
    if (step.skillNames.length > 0) {
      const available = skillEntries(deps);
      const missing = step.skillNames.filter((name) => !available.get(name)?.available);
      if (missing.length > 0) {
        throw ApiError.validation(
          `阶段「${step.title}」引用了不可用技能：${missing.join('、')}`,
        );
      }
    }
  }
}

export function validateStagePlanInput(input: unknown): StagePlan {
  const parsed = stagePlanSchema.safeParse(input);
  if (!parsed.success) {
    throw ApiError.validation('阶段计划不合法', parsed.error.issues);
  }
  return parsed.data;
}

function buildTaskText(step: StagePlanStep, skills: readonly SkillEntry[]): string {
  const lines = [`执行阶段：${step.title}`, '', '要解决的问题：', step.goal.trim()];
  if (skills.length > 0) {
    lines.push('', '使用以下技能；先读取各技能说明并遵循其中适用的要求：');
    for (const skill of skills) lines.push(`- ${skill.name}：${skill.sourcePath}`);
  }
  if (step.deliverables.trim()) {
    lines.push('', '交付要求：', step.deliverables.trim());
  }
  lines.push('', '沿用当前会话上下文。完成后给出交付物、验证结果与仍未解决的问题。');
  return lines.join('\n');
}

export function createStagePlanService(deps: ServiceDeps): StagePlanService {
  const { db } = deps;
  const conversations = createConversationRepository(db);
  const plans = createStagePlanRepository(db);

  const requireConversation = (conversationId: string) => {
    const conversation = conversations.findById(conversationId);
    if (!conversation) throw ApiError.notFound('会话', conversationId);
    return conversation;
  };

  return {
    get(conversationId) {
      requireConversation(conversationId);
      return plans.get(conversationId);
    },

    save(conversationId, input) {
      const conversation = requireConversation(conversationId);
      const plan = validateStagePlanInput(input);
      validateStagePlanBindings(deps, plan);
      const active = plan.activeStep === null ? null : plan.steps[plan.activeStep] ?? null;
      const modelId = active?.modelId ?? null;
      db.transaction(() => {
        plans.upsert(conversationId, plan);
        // activeStep 的模型决定会话级覆盖；无模型阶段清空覆盖
        conversations.setModelId(conversation.id, modelId);
      })();
      return { plan, modelId };
    },

    prepare(conversationId, stepIndex) {
      const conversation = requireConversation(conversationId);
      const plan = plans.get(conversationId);
      if (!plan) throw ApiError.validation('会话还没有阶段计划');
      if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= plan.steps.length) {
        throw ApiError.validation(
          `阶段序号超出范围：${stepIndex}（共 ${plan.steps.length} 个阶段）`,
        );
      }
      const step = plan.steps[stepIndex]!;
      if (!step.title.trim() || !step.goal.trim()) {
        throw ApiError.validation('当前阶段缺少目标，无法载入任务');
      }
      validateStagePlanBindings(deps, { steps: [step], activeStep: null });

      const available = skillEntries(deps);
      const skills = step.skillNames.map((name) => available.get(name)!);

      return {
        taskText: buildTaskText(step, skills),
        modelId: step.modelId ?? conversation.modelId,
        stepIndex,
      };
    },
  };
}
