import { z } from 'zod';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import { getVoiceRuntime } from '@/lib/server/voice/voice-runtime-singleton';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  kind: z.enum(['asr', 'tts']),
  /** TTS 模型（melo/kokoro）；asr 忽略 */
  model: z.enum(['melo', 'kokoro']).optional(),
  /** start=开始/重试下载；cancel=取消 */
  action: z.enum(['start', 'cancel']).default('start'),
});

/** 启动/取消语音模型后台下载（进度经 GET models/status 轮询） */
export const POST = defineRoute(async ({ request }) => {
  const input = parseBody(requestSchema, await readJsonBody(request));
  const runtime = getVoiceRuntime();
  if (input.action === 'cancel') {
    runtime.cancelDownload(input.kind, input.model);
    return jsonOk({ kind: input.kind, cancelled: true });
  }
  const started = runtime.startDownload(input.kind, input.model);
  return jsonOk({ kind: input.kind, model: input.model, started, ...runtime.getDownloadInfo(input.kind, input.model) });
});
