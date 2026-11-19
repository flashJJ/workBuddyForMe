import { describe, expect, it, vi } from 'vitest';
import type { ActionChain } from '@wbfm/shared/schemas';
import { ActionExecutor, type ControllerLike, type ExecutorDeps } from './action-executor';

function createDeps(controller: ControllerLike | null = null) {
  const showSubtitle = vi.fn();
  const deps: ExecutorDeps = {
    controllerRef: { current: controller } as ExecutorDeps['controllerRef'],
    showSubtitle,
  };
  return { deps, showSubtitle };
}

function createController(): ControllerLike {
  return {
    startInteraction: vi.fn(),
    endInteraction: vi.fn(),
    flashExpression: vi.fn(),
    playSquash: vi.fn(),
    tap: vi.fn(),
    setExpression: vi.fn(),
  };
}

function chain(actions: ActionChain['actions']): ActionChain {
  return { actions, priority: 'normal', cooldownMs: 0 };
}

describe('ActionExecutor', () => {
  it('无 controller 时字幕仍然输出', () => {
    const { deps, showSubtitle } = createDeps(null);
    const executor = new ActionExecutor(deps);

    executor.dispatch(
      chain([
        { type: 'subtitle.show', i18nKey: 'emotion.touch.blush0', durationMs: 1200 },
        { type: 'subtitle.pick', pool: 'head-tap', durationMs: 800 },
      ]),
    );

    expect(showSubtitle).toHaveBeenNthCalledWith(1, 'emotion.touch.blush0', 1200);
    expect(showSubtitle).toHaveBeenNthCalledWith(2, expect.any(String), 800);
  });

  it('无 controller 时 controller 类动作静默跳过', () => {
    const { deps } = createDeps(null);
    const executor = new ActionExecutor(deps);

    expect(() =>
      executor.dispatch(
        chain([
          { type: 'interaction.start', kind: 'head-touch' },
          { type: 'controller.playSquash' },
          { type: 'controller.tap', intensity: 0.5 },
          { type: 'controller.flashExpression', tag: 'joy', durationMs: 2600 },
          { type: 'interaction.end', kind: 'head-touch' },
        ]),
      ),
    ).not.toThrow();
  });

  it('有 controller 时逐条驱动表现，并保持字幕输出', () => {
    const controller = createController();
    const { deps, showSubtitle } = createDeps(controller);
    const executor = new ActionExecutor(deps);

    executor.dispatch(
      chain([
        { type: 'interaction.start', kind: 'head-touch' },
        { type: 'controller.playSquash' },
        { type: 'controller.tap', intensity: 0.5 },
        { type: 'controller.flashExpression', tag: 'joy', durationMs: 2600 },
        { type: 'controller.setExpression', tag: 'smirk' },
        { type: 'subtitle.show', i18nKey: 'emotion.touch.blush0', durationMs: 1200 },
        { type: 'interaction.end', kind: 'head-touch' },
      ]),
    );

    expect(controller.startInteraction).toHaveBeenCalledWith('head-touch');
    expect(controller.playSquash).toHaveBeenCalledTimes(1);
    expect(controller.tap).toHaveBeenCalledWith(0.5);
    expect(controller.flashExpression).toHaveBeenCalledWith('joy', 2600);
    expect(controller.setExpression).toHaveBeenCalledWith('smirk');
    expect(controller.endInteraction).toHaveBeenCalledWith('head-touch');
    expect(showSubtitle).toHaveBeenCalledWith('emotion.touch.blush0', 1200);
  });
});
