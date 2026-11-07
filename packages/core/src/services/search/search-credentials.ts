import { createSettingsRepository, type DatabaseInstance } from '@wbfm/database';
import type { SearchCredentialStatus, SearchCredentialsView } from '@wbfm/shared/types';
import { maskSecret, type SecretCipher } from '../../secrets/cipher';

/** 需要密钥的搜索服务（与 SEARCH_KEY_PROVIDERS 保持一致） */
export type SearchCredentialProvider = 'brave' | 'tavily';

/** 密钥存 settings_kv 的独立键，密文落盘；不进入 AppSettings / 前端设置对象 */
const STORAGE_KEY = 'search-credentials';

type StoredCredentials = Partial<Record<SearchCredentialProvider, string>>;

function emptyStatus(): SearchCredentialStatus {
  return { hasKey: false, masked: null };
}

/**
 * v2.24：搜索 API Key 存取。
 * - 加密用现有 SecretCipher（Web/桌面同一套）；
 * - 密文损坏降级为未配置，不阻断设置页；
 * - 只暴露脱敏串，明文仅在服务端构造 provider 时读取。
 */
export function createSearchCredentialStore({
  db,
  cipher,
}: {
  db: DatabaseInstance;
  cipher: SecretCipher;
}) {
  const settings = createSettingsRepository(db);
  const read = (): StoredCredentials => {
    const raw = settings.getJson(STORAGE_KEY, {} as StoredCredentials);
    return raw && typeof raw === 'object' ? raw : {};
  };

  return {
    get(provider: SearchCredentialProvider): string | null {
      const encrypted = read()[provider];
      if (!encrypted) return null;
      const plain = cipher.decrypt(encrypted);
      return plain && plain.trim() ? plain.trim() : null;
    },

    view(): SearchCredentialsView {
      const stored = read();
      const status = (provider: SearchCredentialProvider): SearchCredentialStatus => {
        const encrypted = stored[provider];
        if (!encrypted) return emptyStatus();
        const plain = cipher.decrypt(encrypted);
        return plain && plain.trim()
          ? { hasKey: true, masked: maskSecret(plain.trim()) }
          : emptyStatus();
      };
      return { brave: status('brave'), tavily: status('tavily') };
    },

    set(provider: SearchCredentialProvider, apiKey: string): void {
      const trimmed = apiKey.trim();
      if (!trimmed) return;
      settings.setJson(STORAGE_KEY, { ...read(), [provider]: cipher.encrypt(trimmed) });
    },

    clear(provider: SearchCredentialProvider): void {
      const next = { ...read() };
      delete next[provider];
      settings.setJson(STORAGE_KEY, next);
    },
  };
}

export type SearchCredentialStore = ReturnType<typeof createSearchCredentialStore>;
