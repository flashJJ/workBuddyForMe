import { describe, expect, it } from 'vitest';
import {
  clampStepIndex,
  isFirstStep,
  isLastStep,
  nextStep,
  ONBOARDING_STEPS,
  prevStep,
  stepIndex,
} from './onboarding-state';

describe('onboarding 步骤状态机', () => {
  it('固定 4 步且顺序为 welcome→provider→voice→finish', () => {
    expect([...ONBOARDING_STEPS]).toEqual(['welcome', 'provider', 'voice', 'finish']);
  });

  it('nextStep/prevStep 线性推进且端点钳位', () => {
    expect(nextStep('welcome')).toBe('provider');
    expect(nextStep('provider')).toBe('voice');
    expect(nextStep('voice')).toBe('finish');
    expect(nextStep('finish')).toBe('finish');
    expect(prevStep('finish')).toBe('voice');
    expect(prevStep('provider')).toBe('welcome');
    expect(prevStep('welcome')).toBe('welcome');
  });

  it('stepIndex 与首尾判定', () => {
    expect(stepIndex('voice')).toBe(2);
    expect(isFirstStep('welcome')).toBe(true);
    expect(isLastStep('finish')).toBe(true);
    expect(isFirstStep('provider')).toBe(false);
  });

  it('clampStepIndex 不越界', () => {
    expect(clampStepIndex(-3)).toBe(0);
    expect(clampStepIndex(99)).toBe(ONBOARDING_STEPS.length - 1);
    expect(clampStepIndex(1)).toBe(1);
  });
});
