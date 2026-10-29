import type { RunEventBus } from './run-event-bus';

/**
 * v2.7：给 owner 事件总线挂只读旁路（工作信号摄取）。
 * 旁路异常不得影响 owner/observer，统一吞掉并告警。
 */
export function createSignalTapBus<T>(
  bus: RunEventBus<T>,
  onEvent?: (event: T) => void,
): Pick<RunEventBus<T>, 'publish' | 'close'> {
  return {
    publish(event) {
      bus.publish(event);
      if (!onEvent) return;
      try {
        onEvent(event);
      } catch (error) {
        console.warn('[run] 工作信号摄取失败：', error);
      }
    },
    close() {
      bus.close();
    },
  };
}
