import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { getVoiceRuntime } from '@/lib/server/voice/voice-runtime-singleton';
import { VOICE_TTS_MODELS } from '@wbfm/shared';

export const dynamic = 'force-dynamic';

/** 语音模型就绪状态 + 下载进度（tts 按引擎分别上报，兼容旧字段指向当前选中模型） */
export const GET = defineRoute(async () => {
  const runtime = getVoiceRuntime();
  const [files, asrDl] = await Promise.all([
    runtime.getModelStatus(),
    runtime.getDownloadInfo('asr'),
  ]);
  const ttsDownloads = Object.fromEntries(
    VOICE_TTS_MODELS.map((model) => [model, runtime.getDownloadInfo('tts', model)]),
  );
  return jsonOk({
    ...files,
    downloads: {
      asr: asrDl,
      // 旧消费端仍读 tts（当前选中模型）
      tts: ttsDownloads[files.activeTtsModel],
      ttsByModel: ttsDownloads,
    },
  });
});
