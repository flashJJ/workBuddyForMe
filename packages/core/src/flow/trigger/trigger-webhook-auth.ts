import type { FlowTriggerView } from '@wbfm/shared/types';
import type { WorkflowTriggerRepository } from '@wbfm/database';
import type { SecretCipher } from '../../secrets/cipher';
import { verifyTriggerSecret, verifyWebhookSignature } from './trigger-auth';

/** v5.0：Webhook 鉴权（Bearer / HMAC / 两者），从 trigger-service 拆出以控行数 */

export type WebhookAuthResult =
  | { ok: true; trigger: FlowTriggerView }
  | { ok: false; reason: 'not_found' | 'unauthorized' };

export function authenticateWebhookTrigger(params: {
  triggers: WorkflowTriggerRepository;
  cipher?: SecretCipher;
  triggerId: string;
  authorization: string | null;
  options?: {
    rawBody?: string;
    timestamp?: string | null;
    signature?: string | null;
  };
}): WebhookAuthResult {
  const trigger = params.triggers.getById(params.triggerId);
  if (!trigger || trigger.kind !== 'webhook' || !trigger.enabled) {
    return { ok: false, reason: 'not_found' };
  }
  const mode = trigger.authMode ?? 'bearer';
  let bearerOk = true;
  if (mode === 'bearer' || mode === 'both') {
    const match = /^Bearer\s+(.+)$/i.exec(params.authorization?.trim() ?? '');
    const hash = params.triggers.getSecretHash(params.triggerId);
    bearerOk = Boolean(match && hash && verifyTriggerSecret(match[1]!, hash));
  }
  let hmacOk = true;
  if (mode === 'hmac' || mode === 'both') {
    const cipherText = params.triggers.getSecretCipher(params.triggerId);
    const secret = cipherText ? params.cipher?.decrypt(cipherText) : null;
    hmacOk = Boolean(
      secret &&
        verifyWebhookSignature({
          secret,
          timestamp: params.options?.timestamp ?? null,
          signature: params.options?.signature ?? null,
          rawBody: params.options?.rawBody ?? '',
        }),
    );
  }
  if (!bearerOk || !hmacOk) return { ok: false, reason: 'unauthorized' };
  return { ok: true, trigger };
}
