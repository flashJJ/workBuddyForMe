import type { FlowEventPayload } from '@wbfm/shared/types';
import { createSubstepQueue } from '../chat/substep-queue';
import { isTerminalFlowEvent, type FlowEventBus } from './queue/event-bus';

/**
 * 订阅生成器：先同步补发缓冲，再接实时，终态事件后自动结束。
 * 纯事件流适配：不感知仓储/队列生命周期；observer 中止或消费结束后自动退订。
 */
export async function* streamRunEvents(
  bus: FlowEventBus,
  runId: string,
  catchup: FlowEventPayload[],
  observerSignal?: AbortSignal,
): AsyncGenerator<FlowEventPayload> {
  const q = createSubstepQueue<FlowEventPayload>();
  for (const event of catchup) q.push(event);
  const unsubscribe = bus.subscribe(runId, (event) => q.push(event));
  observerSignal?.addEventListener('abort', () => q.close(), { once: true });
  try {
    for (;;) {
      const item = await q.next();
      if (item.done) break;
      yield item.value;
      if (isTerminalFlowEvent(item.value)) {
        q.close();
        break;
      }
    }
  } finally {
    unsubscribe();
  }
}
