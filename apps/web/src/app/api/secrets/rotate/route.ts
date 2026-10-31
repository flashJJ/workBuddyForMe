import { createSecretRotationService } from '@wbfm/core/secrets';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** POST /api/secrets/rotate：重封装 Provider API Key（Web 轮换主密钥，Desktop 重封装） */
export const POST = defineRoute(({ services }) => {
  const result = createSecretRotationService({
    db: services.db,
    cipher: services.cipher,
  }).rotate();
  services.audit.safeAppend({
    kind: 'secrets_rotated',
    actor: 'user',
    outcome: `mode:${result.mode} rotated:${result.rotated} skipped:${result.skipped} failed:${result.failed}`,
  });
  return jsonOk(result);
});
