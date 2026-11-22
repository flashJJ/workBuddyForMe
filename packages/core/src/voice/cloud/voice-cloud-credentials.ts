import { createSettingsRepository, type DatabaseInstance } from '@wbfm/database';
import type {
  VoiceCloudCredentialsUpdateInput,
  VoiceCloudCredentialsView,
} from '@wbfm/shared/schemas';
import { maskSecret, type SecretCipher } from '../../secrets/cipher';

/** 在线 TTS 凭据存 settings_kv 的独立键，密文落盘；不进入 VoiceSettings */
const STORAGE_KEY = 'voice-cloud-credentials';

interface StoredCloudCredentials {
  secretId?: string;
  secretKey?: string;
  region?: string;
}

export interface CloudTtsCredentials {
  secretId: string;
  secretKey: string;
  region: string;
}

export interface VoiceCloudCredentialStoreOptions {
  db: DatabaseInstance;
  cipher: SecretCipher;
}

/**
 * 腾讯云 TTS 凭据存取：复用搜索密钥同一套 SecretCipher。
 * - 只暴露脱敏后的 SecretId；明文仅在服务端构造引擎时读取；
 * - 密文损坏降级为未配置，不阻断设置页。
 */
export function createVoiceCloudCredentialStore({
  db,
  cipher,
}: VoiceCloudCredentialStoreOptions) {
  const settings = createSettingsRepository(db);
  const read = (): StoredCloudCredentials => {
    const raw = settings.getJson(STORAGE_KEY, {} as StoredCloudCredentials);
    return raw && typeof raw === 'object' ? raw : {};
  };

  const decode = (store: StoredCloudCredentials): CloudTtsCredentials | null => {
    if (!store.secretId || !store.secretKey) return null;
    const secretId = cipher.decrypt(store.secretId);
    const secretKey = cipher.decrypt(store.secretKey);
    if (!secretId?.trim() || !secretKey?.trim()) return null;
    return {
      secretId: secretId.trim(),
      secretKey: secretKey.trim(),
      region: store.region?.trim() || 'ap-guangzhou',
    };
  };

  return {
    get(): CloudTtsCredentials | null {
      return decode(read());
    },

    view(): VoiceCloudCredentialsView {
      const store = read();
      const credentials = decode(store);
      return {
        hasCredentials: Boolean(credentials),
        maskedSecretId: credentials ? maskSecret(credentials.secretId) : null,
        region: store.region?.trim() || credentials?.region || 'ap-guangzhou',
      };
    },

    update(input: VoiceCloudCredentialsUpdateInput): VoiceCloudCredentialsView {
      if (input.clear) {
        settings.setJson(STORAGE_KEY, {});
        return this.view();
      }
      const current = read();
      const next: StoredCloudCredentials = { ...current };
      if (input.region !== undefined) next.region = input.region.trim();
      if (input.secretId !== undefined) next.secretId = cipher.encrypt(input.secretId.trim());
      if (input.secretKey !== undefined) next.secretKey = cipher.encrypt(input.secretKey.trim());
      settings.setJson(STORAGE_KEY, next);
      return this.view();
    },
  };
}

export type VoiceCloudCredentialStore = ReturnType<typeof createVoiceCloudCredentialStore>;
