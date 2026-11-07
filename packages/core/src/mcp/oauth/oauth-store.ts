import { createSettingsRepository, type DatabaseInstance } from '@wbfm/database';
import type { McpOAuthStatus, McpOAuthStatuses } from '@wbfm/shared/types';
import type { SecretCipher } from '../../secrets/cipher';

/** v2.24：OAuth 令牌与待处理授权事务的加密存储（settings_kv，无 schema 迁移） */

const TOKEN_PREFIX = 'mcp-oauth-token:';
const PENDING_PREFIX = 'mcp-oauth-pending:';
const PENDING_TTL_MS = 10 * 60_000;

export interface McpOAuthTokenRecord {
  serverId: string;
  resource: string;
  issuer: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string | null;
  tokenEndpointAuthMethod: string;
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string | null;
  /** epoch ms；null 表示服务器未返回 expires_in */
  expiresAt: number | null;
  accountLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface McpOAuthPendingRecord {
  state: string;
  serverId: string;
  redirectUri: string;
  resource: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string | null;
  clientId: string;
  clientSecret: string | null;
  tokenEndpointAuthMethod: string;
  codeVerifier: string;
  scope: string | null;
  createdAt: number;
}

export function statusOf(record: McpOAuthTokenRecord | null): McpOAuthStatus {
  if (!record) {
    return {
      authorized: false,
      expired: false,
      refreshable: false,
      expiresAt: null,
      scope: null,
      accountLabel: null,
    };
  }
  return {
    authorized: Boolean(record.accessToken),
    expired: record.expiresAt !== null && record.expiresAt <= Date.now(),
    refreshable: Boolean(record.refreshToken),
    expiresAt: record.expiresAt !== null ? new Date(record.expiresAt).toISOString() : null,
    scope: record.scope,
    accountLabel: record.accountLabel,
  };
}

/**
 * 每个服务器/事务单独一个 settings_kv 行，避免并发刷新时读改写同一张 map 互相覆盖。
 */
export function createMcpOAuthStore({
  db,
  cipher,
}: {
  db: DatabaseInstance;
  cipher: SecretCipher;
}) {
  const settings = createSettingsRepository(db);

  const decrypt = <T>(value: unknown): T | null => {
    if (typeof value !== 'string' || !value) return null;
    const plain = cipher.decrypt(value);
    if (!plain) return null;
    try {
      return JSON.parse(plain) as T;
    } catch {
      return null;
    }
  };

  const getToken = (serverId: string): McpOAuthTokenRecord | null =>
    decrypt<McpOAuthTokenRecord>(settings.getJson<unknown>(`${TOKEN_PREFIX}${serverId}`, null));

  const listTokens = (): McpOAuthTokenRecord[] => {
    const all = settings.all();
    const records: McpOAuthTokenRecord[] = [];
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith(TOKEN_PREFIX)) continue;
      const record = decrypt<McpOAuthTokenRecord>(value);
      if (record) records.push(record);
    }
    return records;
  };

  return {
    getToken,

    saveToken(record: McpOAuthTokenRecord): void {
      settings.setJson(
        `${TOKEN_PREFIX}${record.serverId}`,
        cipher.encrypt(JSON.stringify(record)),
      );
    },

    clearToken(serverId: string): void {
      settings.setJson(`${TOKEN_PREFIX}${serverId}`, null);
    },

    listTokens,

    status(serverId: string): McpOAuthStatus {
      return statusOf(getToken(serverId));
    },

    statuses(): McpOAuthStatuses {
      const result: McpOAuthStatuses = {};
      for (const record of listTokens()) {
        result[record.serverId] = statusOf(record);
      }
      return result;
    },

    savePending(pending: McpOAuthPendingRecord): void {
      const now = Date.now();
      for (const [key, value] of Object.entries(settings.all())) {
        if (!key.startsWith(PENDING_PREFIX)) continue;
        const record = decrypt<McpOAuthPendingRecord>(value);
        if (!record || now - record.createdAt > PENDING_TTL_MS) settings.setJson(key, null);
      }
      settings.setJson(
        `${PENDING_PREFIX}${pending.state}`,
        cipher.encrypt(JSON.stringify(pending)),
      );
    },

    takePending(state: string): McpOAuthPendingRecord | null {
      const key = `${PENDING_PREFIX}${state}`;
      const value = settings.getJson<unknown>(key, null);
      settings.setJson(key, null);
      const record = decrypt<McpOAuthPendingRecord>(value);
      if (!record || Date.now() - record.createdAt > PENDING_TTL_MS) return null;
      return record;
    },
  };
}

export type McpOAuthStore = ReturnType<typeof createMcpOAuthStore>;
