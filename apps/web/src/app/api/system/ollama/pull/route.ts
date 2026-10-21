import { z } from 'zod';
import { ApiError } from '@wbfm/shared/errors';
import { OLLAMA_RECOMMENDED_MODELS } from '@wbfm/shared/constants';
import { streamOllamaPull } from '@wbfm/core/services';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const pullBodySchema = z.object({ model: z.string().trim().min(1) });

/** 只允许拉取推荐清单内的模型：避免本接口被当成任意模型名的下载代理 */
const ALLOWED_MODELS = new Set(OLLAMA_RECOMMENDED_MODELS.map((item) => item.modelId));

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
} as const;

/** 事件名不在共享 SSE wire 白名单内（那是对话/任务流的契约），此处按同一格式自成一组帧 */
function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * v2.4 P0-1（T4）：一键拉取本机 Ollama 模型的 SSE 进度流。
 * progress{status,total,completed,percent} → done | error；客户端断开经 request.signal 传导中断。
 */
export const POST = defineRoute(async ({ request }) => {
  const input = parseBody(pullBodySchema, await readJsonBody(request));
  if (!ALLOWED_MODELS.has(input.model)) {
    throw ApiError.validation(`不在推荐清单内的模型：${input.model}`);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 客户端断开后 enqueue 会抛 TypeError，吞掉避免 unhandled rejection
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(frame(event, data)));
        } catch {
          /* 流已取消 */
        }
      };
      try {
        for await (const progress of streamOllamaPull(input.model, { signal: request.signal })) {
          send('progress', progress);
        }
        send('done', { model: input.model });
      } catch (error) {
        if (!request.signal.aborted) {
          send('error', {
            message: error instanceof Error ? error.message : '拉取中断',
          });
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* 已关闭或已取消 */
        }
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
});
