import { defineRoute } from '@/lib/server/with-api-handler';
import { toErrorResponse } from '@/lib/server/api-response';
import { readUploadPart } from '@/lib/server/multipart';
import { getVoiceRuntime } from '@/lib/server/voice/voice-runtime-singleton';

export const dynamic = 'force-dynamic';

/** 语音识别：multipart 字段 file=WAV(PCM16)，返回 {text, lang}。音频不入库。 */
export const POST = defineRoute(async ({ request }) => {
  try {
    // 30 秒 16k/16bit 单声道约 960KB，留足余量取 20MB 通用上限
    const part = await readUploadPart(request, 20 * 1024 * 1024);
    const result = await getVoiceRuntime().transcribeWav(part.buffer);
    return Response.json({ success: true, data: result });
  } catch (error) {
    return toErrorResponse(error);
  }
});
