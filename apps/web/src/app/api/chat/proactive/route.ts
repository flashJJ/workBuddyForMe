import { proactiveRequestSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import { sseResponse } from '@/lib/server/sse-stream';
import { getVoiceRuntime } from '@/lib/server/voice/voice-runtime-singleton';
import { withVoice } from '@/lib/server/voice/voice-chat-bridge';

export const dynamic = 'force-dynamic';

/**
 * F8 主动说话：空闲触发的 skip-history 轻量轮。
 * 与 /api/chat/stream 共用事件协议与语音旁路，但编排器不创建/写入任何消息，
 * meta 帧带 proactive:true，前端以临时气泡+语音呈现且不进历史。
 */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(proactiveRequestSchema, await readJsonBody(request));
  // 助手存在性校验，使 404 走统一 JSON 错误
  services.assistants.get(input.assistantId);

  const events = services.orchestrator.streamProactive({
    assistantId: input.assistantId,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    signal: request.signal,
  });

  if (input.voice?.tts) {
    const runtime = getVoiceRuntime();
    return sseResponse(
      withVoice(events, {
        tts: {
          synthesize: (text: string) => runtime.synthesize(text, input.voice?.speakerId),
        },
        signal: request.signal,
      }),
    );
  }

  return sseResponse(events);
});
