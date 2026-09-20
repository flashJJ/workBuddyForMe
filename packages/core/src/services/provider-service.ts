import { ApiError, type Provider } from '@wbfm/shared';
import {
  createProviderRepository,
  type ProviderRecord,
} from '@wbfm/database';
import type { ProviderCreateInput, ProviderUpdateInput } from '@wbfm/shared';
import { maskSecret } from '../secrets/cipher';
import type { ServiceDeps } from './deps';
import { buildProvider, toApiError } from './provider-adapter';

function toView(record: ProviderRecord, apiKeyMasked: string | null): Provider {
  return { ...record, apiKeyMasked };
}

export function createProviderService({ db, cipher }: ServiceDeps) {
  const repo = createProviderRepository(db);

  const decryptMasked = (record: ProviderRecord): Provider => {
    if (!record.hasApiKey) return toView(record, null);
    const row = repo.getRow(record.id);
    const plain = row?.api_key_cipher ? cipher.decrypt(row.api_key_cipher) : null;
    return toView(record, plain ? maskSecret(plain) : null);
  };

  return {
    list(): Provider[] {
      return repo.list().map((record) => decryptMasked(record));
    },

    get(id: string): Provider {
      const record = repo.get(id);
      if (!record) throw ApiError.notFound('供应商', id);
      return decryptMasked(record);
    },

    create(input: ProviderCreateInput): Provider {
      const sortOrder =
        input.sortOrder ?? repo.list().reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
      const record = repo.create({
        name: input.name,
        protocol: input.protocol,
        baseUrl: input.baseUrl,
        apiKeyCipher: input.apiKey ? cipher.encrypt(input.apiKey) : null,
        enabled: input.enabled ?? true,
        sortOrder,
      });
      return toView(record, input.apiKey ? maskSecret(input.apiKey) : null);
    },

    update(id: string, input: ProviderUpdateInput): Provider {
      const existing = repo.get(id);
      if (!existing) throw ApiError.notFound('供应商', id);
      const record = repo.update(id, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.protocol !== undefined ? { protocol: input.protocol } : {}),
        ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.apiKey !== undefined && input.apiKey !== ''
          ? { apiKeyCipher: cipher.encrypt(input.apiKey) }
          : {}),
      })!;
      return decryptMasked(record);
    },

    delete(id: string): void {
      if (!repo.delete(id)) throw ApiError.notFound('供应商', id);
    },

    /** 连接测试：真实调用供应商 /models，错误归一化 */
    async testConnection(id: string, signal?: AbortSignal): Promise<{ ok: true }> {
      const record = repo.get(id);
      if (!record) throw ApiError.notFound('供应商', id);
      try {
        await buildProvider(db, cipher, record).testConnection(signal);
        return { ok: true };
      } catch (error) {
        toApiError(error);
      }
    },
  };
}

export type ProviderService = ReturnType<typeof createProviderService>;
