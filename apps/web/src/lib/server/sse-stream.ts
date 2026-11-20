import { formatSse } from '@wbfm/shared/api';
import type { WebStreamSseEvent } from '@/lib/api/sse-events';

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
} as const;

/**
 * SSE 流事件类型（v1.1 M4 起从 wire 真源派生）：编排器事件 + v0.7 任务循环 +
 * v1.0 语音帧/状态。
 */
export type SseStreamEvent = WebStreamSseEvent;

/** 将编排器/任务事件流桥接为 SSE Response；客户端断开由 request.signal 传导中断 */
export function sseResponse(events: AsyncIterable<SseStreamEvent>): Response {
  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();
  let cancelled = false;

  /** 取消/结束时释放上游生成器；失败只可能是上游自身的收尾异常，无需上抛 */
  const stopIterator = () => {
    try {
      const result = iterator.return?.();
      if (result) void result.catch(() => {});
    } catch {
      /* 同步收尾异常忽略 */
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 客户端断开后流已取消，enqueue/close 会抛 TypeError；失败即停止拉取上游
      const safeEnqueue = (chunk: Uint8Array): boolean => {
        if (cancelled) return false;
        try {
          controller.enqueue(chunk);
          return true;
        } catch {
          cancelled = true;
          return false;
        }
      };
      try {
        for (;;) {
          const { done, value } = await iterator.next();
          if (done || cancelled) break;
          if (!safeEnqueue(encoder.encode(formatSse(value.event, value.data)))) break;
        }
      } catch {
        safeEnqueue(
          encoder.encode(
            formatSse('error', { code: 'INTERNAL_ERROR', message: '流式响应中断' }),
          ),
        );
      } finally {
        cancelled = true;
        stopIterator();
        try {
          controller.close();
        } catch {
          /* 流已取消或已关闭 */
        }
      }
    },
    cancel() {
      cancelled = true;
      stopIterator();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

/** 解析 SSE wire 文本为事件数组（测试/客户端复用） */
export function parseSseChunks(raw: string): Array<{ event: string; data: unknown }> {
  const result: Array<{ event: string; data: unknown }> = [];
  for (const block of raw.split('\n\n')) {
    const lines = block.split('\n');
    const eventLine = lines.find((line) => line.startsWith('event: '));
    const dataLine = lines.find((line) => line.startsWith('data: '));
    if (eventLine && dataLine) {
      result.push({
        event: eventLine.slice(7),
        data: JSON.parse(dataLine.slice(6)) as unknown,
      });
    }
  }
  return result;
}
