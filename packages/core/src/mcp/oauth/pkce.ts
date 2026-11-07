import { createHash, randomBytes } from 'node:crypto';

/** v2.24：OAuth PKCE / state 生成与授权 URL 构造（无第三方依赖） */
export interface PkcePair {
  verifier: string;
  challenge: string;
}

function base64Url(bytes: Buffer): string {
  return bytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** 32 字节随机串（code_verifier / state） */
export function randomToken(bytes = 32): string {
  return base64Url(randomBytes(bytes));
}

export function createPkcePair(): PkcePair {
  const verifier = randomToken(32);
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export interface AuthorizationUrlInput {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string | null;
  /** RFC 8707：受保护资源标识 */
  resource?: string | null;
}

/** 构造授权跳转 URL；未提供 scope 时不发送，交给授权服务器用默认 scope */
export function buildAuthorizationUrl(input: AuthorizationUrlInput): string {
  const url = new URL(input.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (input.scope) url.searchParams.set('scope', input.scope);
  if (input.resource) url.searchParams.set('resource', input.resource);
  return url.toString();
}
