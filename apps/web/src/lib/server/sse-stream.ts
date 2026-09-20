import { formatSse } from '@wbfm/shared';
import type { OrchestratorEvent } from '@wbfm/core';

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
} as const;

/** 将编排器事件流桥接为 SSE Response；客户端断开由 request.signal 传导中断 */
export function sseResponse(events: AsyncIterable<OrchestratorEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 客户端断开后流已取消，enqueue/close 会抛 TypeError，需吞掉避免 unhandled rejection
      const safeEnqueue = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch {
          /* 流已取消 */
        }
      };
      try {
        for await (const event of events) {
          safeEnqueue(encoder.encode(formatSse(event.event, event.data)));
        }
      } catch {
        safeEnqueue(
          encoder.encode(
            formatSse('error', { code: 'INTERNAL_ERROR', message: '流式响应中断' }),
          ),
        );
      } finally {
        try {
          controller.close();
        } catch {
          /* 流已取消或已关闭 */
        }
      }
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
