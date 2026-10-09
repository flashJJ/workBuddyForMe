/**
 * 首启向导步骤状态机（v1.2 M5）：纯函数，无 React 依赖，便于单测。
 * 顺序：欢迎 → 配供应商 → 语音（可选）→ 完成。
 */
export const ONBOARDING_STEPS = ['welcome', 'provider', 'voice', 'finish'] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

export function stepIndex(step: OnboardingStepId): number {
  return ONBOARDING_STEPS.indexOf(step);
}

export function nextStep(step: OnboardingStepId): OnboardingStepId {
  const idx = stepIndex(step);
  return ONBOARDING_STEPS[Math.min(idx + 1, ONBOARDING_STEPS.length - 1)]!;
}

export function prevStep(step: OnboardingStepId): OnboardingStepId {
  const idx = stepIndex(step);
  return ONBOARDING_STEPS[Math.max(idx - 1, 0)]!;
}

export function isFirstStep(step: OnboardingStepId): boolean {
  return stepIndex(step) === 0;
}

export function isLastStep(step: OnboardingStepId): boolean {
  return stepIndex(step) === ONBOARDING_STEPS.length - 1;
}

/** 线性顺序循环导航用的新索引钳位（供未来非线性格局扩展） */
export function clampStepIndex(index: number): number {
  if (index < 0) return 0;
  if (index >= ONBOARDING_STEPS.length) return ONBOARDING_STEPS.length - 1;
  return index;
}
