import { ApiError } from '@wbfm/shared/errors';
import type { SecretRotationResult } from '@wbfm/shared/schemas';
import { createProviderRepository, type DatabaseInstance } from '@wbfm/database';
import type { SecretCipher } from './cipher';

/**
 * v2.15 M3：Provider 凭证轮换。
 * - 先解密全部可解密行，再轮换 Web 主密钥，最后逐行重加密；
 * - 单条失败不影响其他行，旧密文保留；
 * - Web 仅在 failed=0 时把新 active key 同步到旧 master.key，保证降级可解。
 */
export interface SecretRotationService {
  rotate(): SecretRotationResult;
}

export function createSecretRotationService({
  db,
  cipher,
}: {
  db: DatabaseInstance;
  cipher: SecretCipher;
}): SecretRotationService {
  return {
    rotate() {
      if (cipher.isAvailable && !cipher.isAvailable()) {
        throw new ApiError('SECRET_ROTATION_UNAVAILABLE', '凭证加密能力不可用');
      }

      const repo = createProviderRepository(db);
      const rows: Array<{ id: string; ciphertext: string }> = [];
      for (const record of repo.list()) {
        if (!record.hasApiKey) continue;
        const row = repo.getRow(record.id);
        if (row?.api_key_cipher) rows.push({ id: row.id, ciphertext: row.api_key_cipher });
      }

      const decrypted = rows.map((row) => {
        let plain: string | null = null;
        try {
          plain = cipher.decrypt(row.ciphertext);
        } catch {
          plain = null;
        }
        return { ...row, plain };
      });
      const skippedProviders = decrypted
        .filter((item) => item.plain === null)
        .map((item) => item.id);

      const mode = cipher.mode ?? 'web';
      let keyId: string | null = null;
      if (mode === 'web' && cipher.rotateKey) {
        try {
          keyId = cipher.rotateKey();
        } catch (error) {
          throw new ApiError(
            'SECRET_ROTATION_FAILED',
            `主密钥轮换失败：${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      let rotated = 0;
      const failedProviders: string[] = [];
      for (const item of decrypted) {
        if (item.plain === null) continue;
        try {
          const next = cipher.encrypt(item.plain);
          const updated = repo.update(item.id, { apiKeyCipher: next });
          if (!updated) throw new Error('供应商行不存在');
          rotated += 1;
        } catch {
          failedProviders.push(item.id);
        }
      }

      let legacyKeySynced: boolean | null = null;
      if (mode === 'web') {
        try {
          cipher.finalizeKeyRotation?.(failedProviders.length === 0);
        } catch {
          /* 裁剪失败不影响解密：keyring 仍保留 fallback，下次轮换可再裁剪 */
        }
        legacyKeySynced =
          failedProviders.length === 0 ? Boolean(cipher.syncLegacyKey?.()) : false;
      }

      return {
        mode,
        total: rows.length,
        rotated,
        skipped: skippedProviders.length,
        failed: failedProviders.length,
        skippedProviders,
        failedProviders,
        keyId,
        legacyKeySynced,
      };
    },
  };
}
