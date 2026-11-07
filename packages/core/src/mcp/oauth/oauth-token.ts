import { ApiError } from '@wbfm/shared/errors';
import type { McpOAuthPendingRecord, McpOAuthTokenRecord } from './oauth-store';

/** v2.24：OAuth 令牌端点请求与令牌记录映射（从 oauth-service 拆出控制单文件行数） */

export const TOKEN_TIMEOUT_MS = 15_000;

export function errorDetail(value: unknown): string {
  if (!value || typeof value !== 'object') return '未知错误';
  const record = value as Record<string, unknown>;
  const code = typeof record.error === 'string' ? record.error : 'token_error';
  const description =
    typeof record.error_description === 'string' ? record.error_description : '令牌端点拒绝了请求';
  return `${code}：${description}`;
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object');
    return parsed as Record<string, unknown>;
  } catch {
    throw ApiError.validation(`OAuth 服务返回的不是 JSON（HTTP ${response.status}）`);
  }
}

export async function postToken(
  endpoint: string,
  params: URLSearchParams,
  clientId: string,
  clientSecret: string | null,
  authMethod: string,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
  if (clientSecret && authMethod === 'client_secret_basic') {
    const basic = `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`;
    headers.Authorization = `Basic ${Buffer.from(basic).toString('base64')}`;
  } else if (clientSecret) {
    params.set('client_secret', clientSecret);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: params.toString(),
      signal: controller.signal,
      redirect: 'error',
    });
    const json = await readJson(response);
    if (!response.ok || typeof json.error === 'string') {
      throw ApiError.validation(`OAuth 令牌请求失败：${errorDetail(json)}`);
    }
    return json;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw ApiError.validation('OAuth 令牌请求超时');
    throw ApiError.validation(
      `无法连接 OAuth 令牌端点：${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function accountLabelOf(json: Record<string, unknown>): string | null {
  for (const key of ['workspace_name', 'workspace_id', 'user_id', 'email']) {
    const value = json[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function tokenRecord(
  serverId: string,
  pending: McpOAuthPendingRecord,
  json: Record<string, unknown>,
  previous: McpOAuthTokenRecord | null,
): McpOAuthTokenRecord {
  const accessToken = typeof json.access_token === 'string' ? json.access_token : '';
  if (!accessToken) throw ApiError.validation('OAuth 令牌响应缺少 access_token');
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : null;
  const now = Date.now();
  return {
    serverId,
    resource: pending.resource,
    issuer: pending.issuer,
    tokenEndpoint: pending.tokenEndpoint,
    clientId: pending.clientId,
    clientSecret: pending.clientSecret,
    tokenEndpointAuthMethod: pending.tokenEndpointAuthMethod,
    accessToken,
    refreshToken:
      typeof json.refresh_token === 'string' && json.refresh_token
        ? json.refresh_token
        : previous?.refreshToken ?? null,
    tokenType: typeof json.token_type === 'string' && json.token_type ? json.token_type : 'Bearer',
    scope: typeof json.scope === 'string' ? json.scope : pending.scope,
    expiresAt: expiresIn !== null ? now + expiresIn * 1000 : null,
    accountLabel: accountLabelOf(json) ?? previous?.accountLabel ?? null,
    createdAt: previous?.createdAt ?? new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
}

export function headersOf(record: McpOAuthTokenRecord): Record<string, string> {
  return { Authorization: `${record.tokenType || 'Bearer'} ${record.accessToken}` };
}
