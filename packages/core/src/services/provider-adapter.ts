import { ApiError } from '@wbfm/shared';
import { createMockProvider, createProvider, ProviderError, type ChatProvider } from '@wbfm/ai';
import type { DatabaseInstance, ProviderRecord } from '@wbfm/database';
import type { SecretCipher } from '../secrets/cipher';

/** 取出供应商记录并解密 Key 到内存，构造可用适配器（WBFM_MOCK_AI=1 时注入进程内 mock） */
export function buildProvider(
  db: DatabaseInstance,
  cipher: SecretCipher,
  provider: ProviderRecord,
): ChatProvider {
  if (process.env.WBFM_MOCK_AI === '1') {
    return createMockProvider();
  }
  const row = db
    .prepare(`SELECT api_key_cipher FROM providers WHERE id = ?`)
    .get(provider.id) as { api_key_cipher: string | null } | undefined;
  const apiKey = row?.api_key_cipher ? cipher.decrypt(row.api_key_cipher) : null;
  return createProvider({
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    apiKey,
  });
}

/** 供应商错误统一映射为领域 ApiError（路由层直接识别错误码），非供应商错误透传 */
export function toApiError(error: unknown): never {
  if (error instanceof ProviderError) {
    throw new ApiError(error.code, error.message, {
      upstreamStatus: error.status,
      providerMessage: error.providerMessage,
    });
  }
  throw error;
}
