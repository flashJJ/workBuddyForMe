import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, createProviderRepository, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest, getServices } from '@/lib/server/container';
import { POST as rotateSecrets } from './route';

describe('POST /api/secrets/rotate（v2.15）', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-web-rotate-')));
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('Web：重封装 Provider Key，返回计数并写审计；列表仍可用', async () => {
    __buildContainerForTest(db, createWebCipher());
    const provider = getServices().providers.create({
      name: 'p1',
      protocol: 'openai-compatible',
      baseUrl: 'https://example.test',
      apiKey: 'sk-sentinel-rotate',
    });
    const before = createProviderRepository(db).getRow(provider.id)!.api_key_cipher;

    const response = await rotateSecrets(new Request('http://x', { method: 'POST' }));
    expect(response.status).toBe(200);
    const data = (await response.json()).data;
    expect(data).toMatchObject({
      mode: 'web',
      total: 1,
      rotated: 1,
      skipped: 0,
      failed: 0,
      legacyKeySynced: true,
    });

    const after = createProviderRepository(db).getRow(provider.id)!.api_key_cipher;
    expect(after).not.toBe(before);
    expect(createWebCipher().decrypt(after!)).toBe('sk-sentinel-rotate');
    expect(getServices().providers.list()[0]?.apiKeyMasked).toBe('sk-****tate');

    const audit = getServices().audit.list({ kind: 'secrets_rotated', limit: 10 });
    expect(audit.events[0]).toMatchObject({ kind: 'secrets_rotated', actor: 'user' });
  });

  it('加密能力不可用 → 503 SECRET_ROTATION_UNAVAILABLE', async () => {
    const unavailable: SecretCipher = {
      mode: 'desktop',
      isAvailable: () => false,
      encrypt: (plaintext) => plaintext,
      decrypt: (ciphertext) => ciphertext,
    };
    __buildContainerForTest(db, unavailable);
    const response = await rotateSecrets(new Request('http://x', { method: 'POST' }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('SECRET_ROTATION_UNAVAILABLE');
  });
});
