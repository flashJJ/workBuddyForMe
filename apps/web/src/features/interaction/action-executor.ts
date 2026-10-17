'use client';

import type { ActionChain, InteractionAction, InteractionKind } from '@wbfm/shared/schemas';
import type { TouchControllerLike } from '@/features/avatar/use-head-touch';
import type { VrmControllerLike } from '@/features/avatar/vrm-controller';

/**
 * 动作执行器——把 ActionChain 里每种 action 类型路由到具体执行者。
 *
 * M0 极简实现：同步执行（除了 flashExpression 内部的计时是 controller 管的），
 * 节流/优先级仲裁 **不在这做**（M0 Resolver 已按 region cooldown 挡了，executor 只管执行）。
 *
 * 未来扩展：可以把节流挪到这里、支持优先级队列、支持延迟执行等。
 */

export interface ControllerLike extends Partial<TouchControllerLike> {
  startInteraction?(kind: InteractionKind): void;
  endInteraction?(kind?: InteractionKind): void;
  flashExpression(tag: any, durationMs: number): void;
  playSquash?(): void;
  tap?(intensity?: number): void;
  setExpression?(tag: any): void;
}

export type SubtitleFn = (i18nKey: string, durationMs?: number) => void;

export interface ExecutorDeps {
  /** 角色 controller——VrmController 或 Live2dController */
  controllerRef: React.MutableRefObject<ControllerLike | null>;
  /** 本地短句气泡（PetStage 的 showLine） */
  showSubtitle?: SubtitleFn;
}

export class ActionExecutor {
  constructor(private deps: ExecutorDeps) {}

  dispatch(chain: ActionChain): void {
    for (const action of chain.actions) {
      this.exec(action);
    }
  }

  private exec(action: InteractionAction): void {
    const c = this.deps.controllerRef.current;
    if (!c) return;

    switch (action.type) {
      case 'interaction.start':
        c.startInteraction?.(action.kind);
        break;

      case 'interaction.end':
        c.endInteraction?.(action.kind);
        break;

      case 'controller.playSquash':
        c.playSquash?.();
        break;

      case 'controller.flashExpression':
        c.flashExpression(action.tag, action.durationMs);
        break;

      case 'controller.tap':
        c.tap?.(action.intensity);
        break;

      case 'controller.setExpression':
        c.setExpression?.(action.tag);
        break;

      case 'subtitle.show':
        this.deps.showSubtitle?.(action.i18nKey, action.durationMs);
        break;

      case 'event.fire':
        // M0 暂不桥 EventDirector，直接跳过（M2 实现）
        console.warn('[ActionExecutor] event.fire not yet implemented:', action.sceneId);
        break;

      case 'chat.request':
        // M0 不实现
        break;
    }
  }
}
