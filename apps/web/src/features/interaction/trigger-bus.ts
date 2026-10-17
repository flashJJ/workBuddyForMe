'use client';

import type { InteractionEvent } from '@wbfm/shared/schemas';

/**
 * 交互触发事件总线——进程内发布订阅。
 *
 * 所有触发源（PetStage 手势、AvatarHost 表情、未来感知）统一 emit 到这里，
 * Resolver 订阅后查表输出 ActionChain。
 *
 * M0 极简实现：Set<Handler> + emit 遍历，不做排序/去重/优先级——这些在 Resolver 层。
 */

type Handler = (event: InteractionEvent) => void;

const handlers = new Set<Handler>();

export const TriggerBus = {
  emit(event: InteractionEvent): void {
    // copy 一份 handlers 防止 handler 内部 unsubscribe 导致遍历跳过
    for (const h of [...handlers]) {
      try {
        h(event);
      } catch (e) {
        // 单个 handler 异常不阻断其他
        console.error('[TriggerBus] handler error:', e);
      }
    }
  },

  subscribe(handler: Handler): () => void {
    handlers.add(handler);
    return () => handlers.delete(handler);
  },

  /** 测试用：清空所有 handler */
  _clearForTest(): void {
    handlers.clear();
  },
};
