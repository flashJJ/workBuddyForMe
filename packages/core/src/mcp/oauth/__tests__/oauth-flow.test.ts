import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, createMcpServerRepository } from '@wbfm/database';
import type { SecretCipher } from '../../../secrets/cipher';
import { createMcpOAuthService } from '../oauth-service';
import { createPkcePair } from '../pkce';

const cipher: SecretCipher = {
  encrypt: (plaintext) => `enc:${plaintext}`,
  decrypt: (ciphertext) => (ciphertext.startsWith('enc:') ? ciphertext.slice(4) : null),
};

let server: Server | null = null;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
});

function listen(target: Server): Promise<number> {
  return new Promise((resolve) => {
    target.listen(0, '127.0.0.1', () => {
      const address = target.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
}

function json(response: import('node:http').ServerResponse, data: unknown, status = 200): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(data));
}

describe('MCP OAuth 授权码流程', () => {
  it('PKCE S256 挑战与 verifier 匹配', () => {
    const pair = createPkcePair();
    expect(pair.verifier.length).toBeGreaterThan(40);
    expect(pair.challenge).not.toBe(pair.verifier);
    expect(pair.challenge).not.toContain('=');
  });

  it('发现 → 注册 → 回调换令牌 → 刷新 → 清除', async () => {
    const tokenBodies: URLSearchParams[] = [];
    let base = '';
    server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', base);
      if (request.method === 'POST' && url.pathname === '/mcp') {
        response.writeHead(401, {
          'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp", scope="read"`,
        });
        response.end();
        return;
      }
      if (url.pathname === '/.well-known/oauth-protected-resource/mcp') {
        json(response, {
          resource: `${base}/mcp`,
          authorization_servers: [base],
          scopes_supported: ['read'],
        });
        return;
      }
      if (url.pathname === '/.well-known/oauth-authorization-server') {
        json(response, {
          issuer: base,
          authorization_endpoint: `${base}/authorize`,
          token_endpoint: `${base}/token`,
          registration_endpoint: `${base}/register`,
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/register') {
        json(response, { client_id: 'client-1', token_endpoint_auth_method: 'none' }, 201);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/token') {
        let raw = '';
        request.on('data', (chunk) => (raw += String(chunk)));
        request.on('end', () => {
          const body = new URLSearchParams(raw);
          tokenBodies.push(body);
          if (body.get('grant_type') === 'refresh_token') {
            json(response, {
              access_token: 'access-2',
              token_type: 'Bearer',
              expires_in: 3600,
              scope: 'read',
            });
            return;
          }
          json(response, {
            access_token: 'access-1',
            refresh_token: 'refresh-1',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'read',
            workspace_name: 'Test Workspace',
          });
        });
        return;
      }
      response.writeHead(404).end();
    });
    const port = await listen(server);
    base = `http://127.0.0.1:${port}`;

    const db = createDatabase(':memory:');
    const repo = createMcpServerRepository(db);
    const created = repo.create({
      transport: 'http',
      name: 'mock-oauth',
      url: `${base}/mcp`,
      enabled: true,
    });
    const oauth = createMcpOAuthService({ db, cipher });
    const redirectUri = 'http://127.0.0.1:3123/api/mcp/oauth/callback';
    const { authorizationUrl } = await oauth.start(created.id, redirectUri);
    const auth = new URL(authorizationUrl);
    const state = auth.searchParams.get('state') ?? '';
    expect(auth.searchParams.get('response_type')).toBe('code');
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
    expect(auth.searchParams.get('resource')).toBe(`${base}/mcp`);
    expect(auth.searchParams.get('scope')).toBe('read');

    await oauth.handleCallback({ code: 'code-1', state });
    expect(oauth.status(created.id)).toMatchObject({
      authorized: true,
      expired: false,
      accountLabel: 'Test Workspace',
    });
    expect(await oauth.authorizationHeaders(created.id)).toEqual({
      Authorization: 'Bearer access-1',
    });

    await expect(oauth.handleCallback({ code: 'code-2', state })).rejects.toThrow(/失效/);
    expect(await oauth.refresh(created.id)).toEqual({ Authorization: 'Bearer access-2' });
    expect(tokenBodies[1]?.get('grant_type')).toBe('refresh_token');
    expect(tokenBodies[1]?.get('resource')).toBe(`${base}/mcp`);

    oauth.clear(created.id);
    expect(oauth.status(created.id).authorized).toBe(false);
  });
});
