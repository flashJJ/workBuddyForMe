import { ApiError } from '@wbfm/shared/errors';
import { APP_VERSION } from '@wbfm/shared/version';
import { isBlockedIp, assertSafeUrlLiteral, resolveAndAssertHost } from '../../tools/ssrf-guard';
import { MCP_PROTOCOL_VERSION } from '../jsonrpc';

/** v2.24：MCP OAuth 发现（RFC 9470 受保护资源 → RFC 8414 授权服务器） */

export interface ProtectedResourceMetadata {
  resource?: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
}

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
}

export interface OAuthDiscoveryResult {
  /** 作为 RFC 8707 resource 参数 */
  resource: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string | null;
  scope: string | null;
}

const DISCOVERY_TIMEOUT_MS = 8_000;

function isLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1') return true;
  // IP 字面量命中内网段也视为本机/内网环境，允许 http 便于本地开发
  const literal = /^[\d.]+$/.test(host) || host.includes(':');
  return literal && isBlockedIp(host).blocked;
}

/** OAuth 端点必须 https（本机回环除外），并做 SSRF 解析校验 */
async function assertOAuthEndpoint(raw: string, allowPrivate: boolean): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw ApiError.validation(`OAuth 端点不是合法 URL：${raw}`);
  }
  if (url.protocol !== 'https:' && !isLocalHost(url.hostname)) {
    throw ApiError.validation('OAuth 端点必须使用 https（本机回环除外）');
  }
  if (!allowPrivate) {
    assertSafeUrlLiteral(raw);
    await resolveAndAssertHost(url.hostname);
  }
  return url;
}

async function fetchJson(raw: string, allowPrivate: boolean): Promise<Record<string, unknown>> {
  let url = await assertOAuthEndpoint(raw, allowPrivate);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    for (let hop = 0; hop < 3; hop += 1) {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': `workbuddy-for-me/${APP_VERSION}` },
        // 手动处理重定向：每一跳都重新做私网校验，避免被重定向到内网
        redirect: 'manual',
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw ApiError.validation('OAuth 元数据重定向缺少 Location');
        url = await assertOAuthEndpoint(new URL(location, url).toString(), allowPrivate);
        continue;
      }
      const text = await response.text();
      if (!response.ok) {
        throw ApiError.validation(
          `OAuth 元数据请求失败（HTTP ${response.status}）：${text.trim().slice(0, 160)}`,
        );
      }
      try {
        const parsed = JSON.parse(text) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('not object');
        }
        return parsed as Record<string, unknown>;
      } catch {
        throw ApiError.validation('OAuth 元数据返回的不是 JSON');
      }
    }
    throw ApiError.validation('OAuth 元数据重定向过多');
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw ApiError.validation('OAuth 元数据请求超时');
    throw ApiError.validation(
      `无法获取 OAuth 元数据：${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function headerParam(header: string, name: string): string | null {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|([^,\\s]+))`, 'i');
  const match = header.match(pattern);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

function candidateUrls(base: URL, path: string): string[] {
  const origin = base.origin;
  const suffix = base.pathname === '/' ? '' : base.pathname.replace(/\/+$/, '');
  return [...new Set([`${origin}${path}${suffix}`, `${origin}${path}`])];
}

/** 探测 MCP 端点，返回发现结果；服务器不需要 OAuth 时抛 422 */
export async function discoverOAuth(mcpServerUrl: string): Promise<OAuthDiscoveryResult> {
  let mcpUrl: URL;
  try {
    mcpUrl = new URL(mcpServerUrl);
  } catch {
    throw ApiError.validation('MCP 服务器 URL 不合法');
  }
  const allowPrivate = isLocalHost(mcpUrl.hostname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  let challenge = '';
  try {
    const response = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'User-Agent': `workbuddy-for-me/${APP_VERSION}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'workbuddy-for-me', version: APP_VERSION },
        },
      }),
      signal: controller.signal,
    });
    challenge = response.headers.get('www-authenticate') ?? '';
    if (response.ok) {
      throw ApiError.validation('该 MCP 服务器未要求 OAuth 授权，可直接使用');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw ApiError.validation('探测 MCP 服务器超时');
    throw ApiError.validation(
      `无法探测 MCP 服务器：${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const resourceMetadataUrl = headerParam(challenge, 'resource_metadata');
  const scope = headerParam(challenge, 'scope');
  const candidates = [
    ...(resourceMetadataUrl ? [resourceMetadataUrl] : []),
    ...candidateUrls(mcpUrl, '/.well-known/oauth-protected-resource'),
  ];

  let resourceMetadata: ProtectedResourceMetadata | null = null;
  for (const candidate of candidates) {
    try {
      const json = (await fetchJson(candidate, allowPrivate)) as ProtectedResourceMetadata;
      if (Array.isArray(json.authorization_servers) && json.authorization_servers.length > 0) {
        resourceMetadata = json;
        break;
      }
    } catch {
      /* 尝试下一个候选地址 */
    }
  }
  if (!resourceMetadata) {
    throw ApiError.validation('未发现 OAuth 受保护资源元数据，该服务器可能只支持 API Key');
  }

  const issuerRaw = resourceMetadata.authorization_servers![0]!;
  const issuer = await assertOAuthEndpoint(issuerRaw, allowPrivate);
  const authCandidates = [
    ...candidateUrls(issuer, '/.well-known/oauth-authorization-server'),
    ...candidateUrls(issuer, '/.well-known/openid-configuration'),
  ];

  let metadata: AuthorizationServerMetadata | null = null;
  for (const candidate of authCandidates) {
    try {
      const json = (await fetchJson(candidate, allowPrivate)) as unknown as AuthorizationServerMetadata;
      if (json.authorization_endpoint && json.token_endpoint) {
        metadata = json;
        break;
      }
    } catch {
      /* 尝试下一个候选地址 */
    }
  }
  if (!metadata) {
    throw ApiError.validation('未发现 OAuth 授权服务器元数据');
  }
  if (
    Array.isArray(metadata.code_challenge_methods_supported) &&
    !metadata.code_challenge_methods_supported.includes('S256')
  ) {
    throw ApiError.validation('授权服务器不支持 PKCE S256，无法安全授权');
  }

  return {
    resource: resourceMetadata.resource ?? mcpUrl.toString(),
    issuer: metadata.issuer || issuer.toString(),
    authorizationEndpoint: (
      await assertOAuthEndpoint(metadata.authorization_endpoint, allowPrivate)
    ).toString(),
    tokenEndpoint: (await assertOAuthEndpoint(metadata.token_endpoint, allowPrivate)).toString(),
    registrationEndpoint: metadata.registration_endpoint
      ? (await assertOAuthEndpoint(metadata.registration_endpoint, allowPrivate)).toString()
      : null,
    scope,
  };
}
