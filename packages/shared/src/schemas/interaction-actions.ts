/**
 * 桌宠交互动作链类型。
 *
 * Resolver 输出 ActionChain[]，每个 chain 是一组有序动作 + 优先级 + 冷却。
 * 纯类型文件（<100 行），无运行时依赖。
 */

import type { ExpressionTag } from './expression';
import type { MessageKey } from '../i18n';

export type InteractionAction =
  | { type: 'interaction.start'; kind: InteractionKind }
  | { type: 'interaction.end'; kind?: InteractionKind }
  | { type: 'controller.playSquash'; scaleX?: number; scaleY?: number; durationMs?: number }
  | { type: 'controller.flashExpression'; tag: ExpressionTag; durationMs: number }
  | { type: 'controller.tap'; intensity?: number }
  | { type: 'controller.setExpression'; tag: ExpressionTag; durationMs?: number }
  | { type: 'subtitle.show'; i18nKey: MessageKey; durationMs?: number }
  | { type: 'chat.request'; prompt: string }
  | { type: 'event.fire'; sceneId: string };

/** 三段式 InteractionState.kind */
export type InteractionKind = 'head-touch' | 'body-touch' | 'raised' | 'pinch';

export type ChainPriority = 'low' | 'normal' | 'high';

export interface ActionChain {
  /** 动作列表，按序执行（同级可并行） */
  actions: InteractionAction[];
  /** 优先级——冲突仲裁用（高优先级可打断低） */
  priority: ChainPriority;
  /** 同一事件源的冷却毫秒，Executor 用它节流 */
  cooldownMs: number;
}
