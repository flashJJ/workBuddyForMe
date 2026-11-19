import { describe, expect, it } from 'vitest';
import { resolveEffectiveContextWindow, HARNESS_MAX_CONTEXT_WINDOW } from './effective-window';

describe('resolveEffectiveContextWindow：生效上下文窗口', () => {
  it('显式配置优先，并受 harness 上限约束', () => {
    expect(resolveEffectiveContextWindow({ modelId: 'custom', contextWindow: 32_000 })).toEqual({
      declared: 32_000,
      effective: 32_000,
      source: 'declared',
    });
    const capped = resolveEffectiveContextWindow({
      modelId: 'custom',
      contextWindow: 2_000_000,
    });
    expect(capped.effective).toBe(HARNESS_MAX_CONTEXT_WINDOW);
  });

  it('未配置时按厂商提示表回落', () => {
    expect(resolveEffectiveContextWindow({ modelId: 'deepseek-chat', contextWindow: null })).toMatchObject({
      effective: 128_000,
      source: 'hint',
    });
    expect(resolveEffectiveContextWindow({ modelId: 'claude-sonnet', contextWindow: null })).toMatchObject({
      effective: 200_000,
      source: 'hint',
    });
  });

  it('未知模型回落保守默认', () => {
    expect(resolveEffectiveContextWindow({ modelId: 'some-local-model', contextWindow: null })).toMatchObject({
      effective: 8_192,
      source: 'default',
    });
  });
});
