import { chatRequestSchema } from '@wbfm/shared/schemas';
import { createRagRetriever } from '@wbfm/core/retrieval';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import { sseResponse } from '@/lib/server/sse-stream';
import { getVoiceRuntime } from '@/lib/server/voice/voice-runtime-singleton';
import { withVoice } from '@/lib/server/voice/voice-chat-bridge';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(chatRequestSchema, await readJsonBody(request));
  // 在打开 SSE 前完成存在性校验，使 404/422 走统一 JSON 错误
  services.assistants.get(input.assistantId);

  const retriever = createRagRetriever({ db: services.db, cipher: services.cipher });
  const events = services.orchestrator.streamChat({
    ...input,
    signal: request.signal,
    retrieve: retriever,
  });

  // v1.0：请求显式要求语音朗读时，旁路包装为「文本 + voice_audio」流。
  // 缺省（voice 缺省/tts=false）直接返回原事件流，行为与 v0.9 一致。
  if (input.voice?.tts) {
    const runtime = getVoiceRuntime();
    return sseResponse(
      withVoice(events, {
        // 未显式带 sid 时，runtime 按当前 avatarModelId 的角色绑定声线合成
        tts: {
          synthesize: (text: string) => runtime.synthesize(text, input.voice?.speakerId),
        },
        signal: request.signal,
      }),
    );
  }

  return sseResponse(events);
});
