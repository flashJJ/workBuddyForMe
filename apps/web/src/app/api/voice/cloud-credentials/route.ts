import { voiceCloudCredentialsUpdateSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import { createVoiceCloudCredentialStore } from '@wbfm/core/voice';
import { getVoiceRuntime } from '@/lib/server/voice/voice-runtime-singleton';

export const dynamic = 'force-dynamic';

/** 读取在线 TTS 凭据状态（只返回脱敏 SecretId，不返回密钥明文） */
export const GET = defineRoute(({ services }) => {
  const store = createVoiceCloudCredentialStore({ db: services.db, cipher: services.cipher });
  return jsonOk(store.view());
});

/** 保存在线 TTS 凭据（密文落盘）；保存后使引擎下次惰性重建 */
export const PUT = defineRoute(async ({ request, services }) => {
  const input = parseBody(
    voiceCloudCredentialsUpdateSchema,
    await readJsonBody(request),
  );
  const store = createVoiceCloudCredentialStore({ db: services.db, cipher: services.cipher });
  const view = store.update(input);
  getVoiceRuntime().invalidateTts();
  return jsonOk(view);
});
