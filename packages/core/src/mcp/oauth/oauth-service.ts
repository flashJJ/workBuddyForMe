import { ApiError } from '@wbfm/shared/errors';
import type { McpOAuthStatus, McpOAuthStatuses } from '@wbfm/shared/types';
import { createMcpServerRepository, type DatabaseInstance } from '@wbfm/database';
import type { SecretCipher } from '../../secrets/cipher';
import { discoverOAuth, type OAuthDiscoveryResult } from './discovery';
import { buildAuthorizationUrl, createPkcePair, randomToken } from './pkce';
import {
  createMcpOAuthStore,
  statusOf,
  type McpOAuthPendingRecord,
  type McpOAuthTokenRecord,
} from './oauth-store';
import {
  TOKEN_TIMEOUT_MS,
  errorDetail,
  headersOf,
  postToken,
  readJson,
  tokenRecord,
} from './oauth-token';

/** v2.24：MCP OAuth 2.1（授权码 + PKCE + 动态客户端注册 + 刷新令牌） */

const REFRESH_SKEW_MS = 60_000;

export interface McpOAuthService {
  start(serverId: string, redirectUri: string): Promise<{ authorizationUrl: string }>;
  handleCallback(input: { code: string; state: string; iss?: string | null }): Promise<{ serverId: string }>;
  status(serverId: string): McpOAuthStatus;
  statuses(): McpOAuthStatuses;
  clear(serverId: string): void;
  /** 连接时注入请求头；令牌快过期时自动刷新 */
  authorizationHeaders(serverId: string): Promise<Record<string, string>>;
  refresh(serverId: string): Promise<Record<string, string> | null>;
}

interface ClientRegistration {
  clientId: string;
  clientSecret: string | null;
  tokenEndpointAuthMethod: string;
}

export function createMcpOAuthService({
  db,
  cipher,
}: {
  db: DatabaseInstance;
  cipher: SecretCipher;
}): McpOAuthService {
  const servers = createMcpServerRepository(db);
  const store = createMcpOAuthStore({ db, cipher });
  const refreshing = new Map<string, Promise<Record<string, string> | null>>();

  async function registerClient(
    discovery: OAuthDiscoveryResult,
    redirectUri: string,
  ): Promise<ClientRegistration> {
    if (!discovery.registrationEndpoint) {
      throw ApiError.validation('授权服务器不支持动态客户端注册，暂无法自动授权');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
    try {
      const response = await fetch(discovery.registrationEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_name: 'WorkBuddyForMe',
          client_uri: 'https://github.com/',
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
        signal: controller.signal,
        // 令牌/注册端点不应重定向；拒绝跟随以避免被引到未校验地址
        redirect: 'error',
      });
      const json = await readJson(response);
      if (!response.ok || typeof json.client_id !== 'string' || !json.client_id) {
        throw ApiError.validation(`动态客户端注册失败：${errorDetail(json)}`);
      }
      const clientSecret = typeof json.client_secret === 'string' ? json.client_secret : null;
      const method =
        typeof json.token_endpoint_auth_method === 'string'
          ? json.token_endpoint_auth_method
          : clientSecret
            ? 'client_secret_post'
            : 'none';
      return { clientId: json.client_id, clientSecret, tokenEndpointAuthMethod: method };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) throw ApiError.validation('动态客户端注册超时');
      throw ApiError.validation(
        `动态客户端注册失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function exchangeCode(
    pending: McpOAuthPendingRecord,
    code: string,
  ): Promise<McpOAuthTokenRecord> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: pending.clientId,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.codeVerifier,
      resource: pending.resource,
    });
    const json = await postToken(
      pending.tokenEndpoint,
      params,
      pending.clientId,
      pending.clientSecret,
      pending.tokenEndpointAuthMethod,
    );
    return tokenRecord(pending.serverId, pending, json, store.getToken(pending.serverId));
  }

  async function refreshNow(serverId: string): Promise<Record<string, string> | null> {
    const existing = store.getToken(serverId);
    if (!existing || !existing.refreshToken || !existing.tokenEndpoint) return null;
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: existing.refreshToken,
      client_id: existing.clientId,
      resource: existing.resource,
    });
    const json = await postToken(
      existing.tokenEndpoint,
      params,
      existing.clientId,
      existing.clientSecret,
      existing.tokenEndpointAuthMethod,
    );
    const next = tokenRecord(
      serverId,
      {
        state: '',
        serverId,
        redirectUri: '',
        resource: existing.resource,
        issuer: existing.issuer,
        authorizationEndpoint: '',
        tokenEndpoint: existing.tokenEndpoint,
        registrationEndpoint: null,
        clientId: existing.clientId,
        clientSecret: existing.clientSecret,
        tokenEndpointAuthMethod: existing.tokenEndpointAuthMethod,
        codeVerifier: '',
        scope: existing.scope,
        createdAt: Date.now(),
      },
      json,
      existing,
    );
    store.saveToken(next);
    return headersOf(next);
  }

  const refresh = (serverId: string): Promise<Record<string, string> | null> => {
    const ongoing = refreshing.get(serverId);
    if (ongoing) return ongoing;
    const task = refreshNow(serverId)
      .catch((error) => {
        if (error instanceof ApiError && /invalid_grant/.test(error.message)) {
          store.clearToken(serverId);
        }
        throw error;
      })
      .finally(() => refreshing.delete(serverId));
    refreshing.set(serverId, task);
    return task;
  };

  return {
    async start(serverId, redirectUri) {
      const server = servers.get(serverId);
      if (!server) throw ApiError.notFound('MCP 服务器', serverId);
      if (server.transport !== 'http' || !server.url.trim()) {
        throw ApiError.validation('只有远程 HTTP MCP 服务器支持 OAuth 授权');
      }
      const discovery = await discoverOAuth(server.url.trim());
      const client = await registerClient(discovery, redirectUri);
      const pkce = createPkcePair();
      const state = randomToken(24);
      const pending: McpOAuthPendingRecord = {
        state,
        serverId,
        redirectUri,
        resource: discovery.resource,
        issuer: discovery.issuer,
        authorizationEndpoint: discovery.authorizationEndpoint,
        tokenEndpoint: discovery.tokenEndpoint,
        registrationEndpoint: discovery.registrationEndpoint,
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
        codeVerifier: pkce.verifier,
        scope: discovery.scope,
        createdAt: Date.now(),
      };
      store.savePending(pending);
      return {
        authorizationUrl: buildAuthorizationUrl({
          authorizationEndpoint: discovery.authorizationEndpoint,
          clientId: client.clientId,
          redirectUri,
          state,
          codeChallenge: pkce.challenge,
          scope: discovery.scope,
          resource: discovery.resource,
        }),
      };
    },

    async handleCallback({ code, state, iss }) {
      const pending = store.takePending(state);
      if (!pending) throw ApiError.validation('授权状态已失效，请重新发起授权');
      if (iss && pending.issuer && iss !== pending.issuer) {
        throw ApiError.validation('授权响应签发方与预期不一致，已拒绝');
      }
      const record = await exchangeCode(pending, code);
      store.saveToken(record);
      return { serverId: pending.serverId };
    },

    status(serverId) {
      return statusOf(store.getToken(serverId));
    },

    statuses() {
      return store.statuses();
    },

    clear(serverId) {
      store.clearToken(serverId);
    },

    async authorizationHeaders(serverId) {
      const record = store.getToken(serverId);
      if (!record) return {};
      if (record.expiresAt !== null && record.expiresAt <= Date.now() + REFRESH_SKEW_MS) {
        if (!record.refreshToken) return {};
        const refreshed = await refresh(serverId).catch(() => null);
        return refreshed ?? {};
      }
      return headersOf(record);
    },

    refresh,
  };
}
