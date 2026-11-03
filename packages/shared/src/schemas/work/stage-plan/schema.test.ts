import { describe, expect, it } from 'vitest';
import { assistantCreateSchema, assistantUpdateSchema } from '../../chat/assistant';
import { stagePlanSchema } from './schema';

function step(title = '阶段', extra: Record<string, unknown> = {}) {
  return { title, modelId: null, skillNames: [], goal: '', deliverables: '', ...extra };
}

function plan(overrides: Record<string, unknown> = {}) {
  return { steps: [step()], activeStep: null, ...overrides };
}

describe('v2.20 阶段计划 Schema', () => {
  it('1–8 个阶段合法，0/9 个拒绝', () => {
    expect(stagePlanSchema.safeParse(plan()).success).toBe(true);
    expect(stagePlanSchema.safeParse(plan({ steps: Array.from({ length: 8 }, (_, i) => step(`阶段${i}`)) })).success).toBe(true);
    expect(stagePlanSchema.safeParse(plan({ steps: [] })).success).toBe(false);
    expect(stagePlanSchema.safeParse(plan({ steps: Array.from({ length: 9 }, (_, i) => step(`阶段${i}`)) })).success).toBe(false);
  });

  it('标题 40 字合法，41 字拒绝', () => {
    expect(stagePlanSchema.safeParse(plan({ steps: [step('x'.repeat(40))] })).success).toBe(true);
    expect(stagePlanSchema.safeParse(plan({ steps: [step('x'.repeat(41))] })).success).toBe(false);
  });

  it('技能去重且上限 12，13 个拒绝', () => {
    const parsed = stagePlanSchema.parse(plan({ steps: [step('S', { skillNames: ['a', 'a', 'b'] })] }));
    expect(parsed.steps[0]!.skillNames).toEqual(['a', 'b']);
    expect(
      stagePlanSchema.safeParse(
        plan({ steps: [step('S', { skillNames: Array.from({ length: 13 }, (_, i) => `s${i}`) })] }),
      ).success,
    ).toBe(false);
  });

  it('目标/交付各 4000 字合法，4001 拒绝', () => {
    expect(stagePlanSchema.safeParse(plan({ steps: [step('S', { goal: 'x'.repeat(4000) })] })).success).toBe(true);
    expect(stagePlanSchema.safeParse(plan({ steps: [step('S', { goal: 'x'.repeat(4001) })] })).success).toBe(false);
    expect(stagePlanSchema.safeParse(plan({ steps: [step('S', { deliverables: 'x'.repeat(4001) })] })).success).toBe(false);
  });

  it('activeStep 必须落在阶段范围内', () => {
    expect(stagePlanSchema.safeParse(plan({ steps: [step('A'), step('B')], activeStep: 1 })).success).toBe(true);
    expect(stagePlanSchema.safeParse(plan({ steps: [step('A')], activeStep: 1 })).success).toBe(false);
    expect(stagePlanSchema.safeParse(plan({ steps: [step('A')], activeStep: -1 })).success).toBe(false);
  });

  it('助手创建默认无阶段，更新可显式清空/设置', () => {
    const created = assistantCreateSchema.parse({ name: 'A' });
    expect(created.stagePlan).toBeNull();
    const updated = assistantUpdateSchema.parse({ stagePlan: plan() });
    expect(updated.stagePlan?.steps).toHaveLength(1);
    expect(assistantUpdateSchema.parse({ stagePlan: null }).stagePlan).toBeNull();
  });
});
