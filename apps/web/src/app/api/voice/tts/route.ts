import { voiceTtsRequestSchema } from '@wbfm/shared';
import { encodePcm16Wav } from '@wbfm/voice';
import { defineRoute } from '@/lib/server/with-api-handler';
import { toErrorResponse } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import { getVoiceRuntime } from '@/lib/server/voice/voice-runtime-singleton';

export const dynamic = 'force-dynamic';

/**
 * 单句 TTS 合成（设置试听/单句调试）。
 * 对话流的逐句朗读走 /api/chat/stream 的 voice_audio 事件，不经此路由。
 * 返回 audio/wav（PCM16，引擎原生采样率）。
 */
export const POST = defineRoute(async ({ request }) => {
  const input = parseBody(voiceTtsRequestSchema, await readJsonBody(request));
  try {
    const runtime = getVoiceRuntime();
    // speakerId 缺省时 runtime 按当前角色绑定声线合成（设置页角色试听显式传入）
    const { samples, sampleRate } = await runtime.synthesize(input.text, input.speakerId);
    const wav = encodePcm16Wav(samples, sampleRate);
    return new Response(new Uint8Array(wav), {
      headers: {
        'content-type': 'audio/wav',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    // VoiceEngineError 等统一走错误包络，前端据 hint 引导下载
    return toErrorResponse(error);
  }
});
