import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { getVoiceRuntime } from '@/lib/server/voice/voice-runtime-singleton';

export const dynamic = 'force-dynamic';

/** 语音模型就绪状态 + 下载进度 */
export const GET = defineRoute(async () => {
  const runtime = getVoiceRuntime();
  const [files, asrDl, ttsDl] = await Promise.all([
    runtime.getModelStatus(),
    Promise.resolve(runtime.getDownloadInfo('asr')),
    Promise.resolve(runtime.getDownloadInfo('tts')),
  ]);
  return jsonOk({
    ...files,
    downloads: { asr: asrDl, tts: ttsDl },
  });
});
