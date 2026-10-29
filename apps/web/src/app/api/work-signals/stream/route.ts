import { formatSse } from '@wbfm/shared/api';
import type { WorkSignalSnapshot } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';

export const dynamic = 'force-dynamic';

const HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
} as const;

/**
 * GET /api/work-signals/stream：桌宠/审批页订阅工作信号快照。
 * 首帧为当前快照；之后每次信号或审批变化推一帧。
 */
export const GET = defineRoute(({ request, services }) => {
  const encoder = new TextEncoder();
  const iterator = services.workSignals.subscribe()[Symbol.asyncIterator]();
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: WorkSignalSnapshot) => {
        try {
          controller.enqueue(encoder.encode(formatSse('work_signal', payload)));
        } catch {
          cancelled = true;
        }
      };
      const abort = new Promise<null>((resolve) => {
        if (request.signal.aborted) resolve(null);
        else request.signal.addEventListener('abort', () => resolve(null), { once: true });
      });
      try {
        send(services.workSignals.snapshot());
        while (!cancelled) {
          const next = await Promise.race([iterator.next(), abort]);
          if (next === null || next.done) break;
          send(next.value);
        }
      } finally {
        cancelled = true;
        void iterator.return?.();
        try {
          controller.close();
        } catch {
          /* 流已取消 */
        }
      }
    },
    cancel() {
      cancelled = true;
      void iterator.return?.();
    },
  });

  return new Response(stream, { headers: HEADERS });
});
