import { createSettingsRepository } from '@wbfm/database';
import { voiceSettingsUpdateSchema } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import { getVoiceRuntime } from '@/lib/server/voice/voice-runtime-singleton';
import { patchVoiceSettings, readVoiceSettings } from '@/lib/server/voice/voice-settings';

export const dynamic = 'force-dynamic';

/** 读取语音设置（含默认值） */
export const GET = defineRoute(({ services }) => {
  return jsonOk(readVoiceSettings(createSettingsRepository(services.db)));
});

/** 更新语音设置；影响引擎的变更使 TTS 单例下次惰性重建 */
export const PUT = defineRoute(async ({ request, services }) => {
  const patch = parseBody(voiceSettingsUpdateSchema, await readJsonBody(request));
  const next = patchVoiceSettings(createSettingsRepository(services.db), patch);
  if (
    patch.ttsSpeakerId !== undefined ||
    patch.ttsSpeed !== undefined ||
    patch.ttsNumThreads !== undefined ||
    patch.modelsDir !== undefined
  ) {
    getVoiceRuntime().invalidateTts();
  }
  if (patch.asrNumThreads !== undefined || patch.modelsDir !== undefined) {
    getVoiceRuntime().invalidateAsr();
  }
  return jsonOk(next);
});
