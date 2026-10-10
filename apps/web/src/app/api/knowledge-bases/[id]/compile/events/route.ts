import { idParamSchema } from '@wbfm/shared/schemas';
import type { SseEvent } from '@wbfm/shared/api';
import { defineRoute } from '@/lib/server/with-api-handler';
import { sseResponse } from '@/lib/server/sse-stream';
import { parseParams } from '@/lib/server/validation';
import type { CompileQueueEvent } from '@wbfm/core/knowledge';

export const dynamic = 'force-dynamic';

/**
 * v1.3 M4：编译进度 SSE 事件流。
 * 连接即回一帧 compile-status 快照，随后推送该库的 progress/idle 事件；
 * 客户端断开由 request.signal 传导退订。
 */
export const GET = defineRoute(({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.knowledgeBases.get(id);

  async function* events(): AsyncIterable<SseEvent<'compile'>> {
    const buffer: CompileQueueEvent[] = [];
    let wake: (() => void) | null = null;
    let closed = false;
    const push = (event: CompileQueueEvent) => {
      buffer.push(event);
      wake?.();
      wake = null;
    };
    const unsubscribe = services.knowledgeCompile.subscribeCompile(id, push);
    const onAbort = () => {
      closed = true;
      wake?.();
      wake = null;
    };
    request.signal.addEventListener('abort', onAbort, { once: true });
    try {
      // 首帧：状态快照（前端据此渲染徽标，再等增量事件）
      yield { event: 'compile', data: services.knowledgeCompile.getCompileStatus(id) };
      while (!closed) {
        if (buffer.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
        while (buffer.length > 0) {
          const next = buffer.shift();
          if (next) yield { event: 'compile', data: next };
        }
      }
    } finally {
      unsubscribe();
      request.signal.removeEventListener('abort', onAbort);
    }
  }

  return sseResponse(events());
});
