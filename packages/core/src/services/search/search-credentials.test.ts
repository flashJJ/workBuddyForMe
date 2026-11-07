import { describe, expect, it } from 'vitest';
import { createDatabase } from '@wbfm/database';
import type { SecretCipher } from '../../secrets/cipher';
import { createSearchCredentialStore } from './search-credentials';

const cipher: SecretCipher = {
  encrypt: (plaintext) => `enc:${plaintext}`,
  decrypt: (ciphertext) => (ciphertext.startsWith('enc:') ? ciphertext.slice(4) : null),
};

describe('搜索密钥存取', () => {
  it('加密保存、脱敏展示与清除', () => {
    const db = createDatabase(':memory:');
    const store = createSearchCredentialStore({ db, cipher });

    expect(store.get('tavily')).toBeNull();
    expect(store.view().tavily).toEqual({ hasKey: false, masked: null });

    store.set('tavily', 'tvly-12345678');
    expect(store.get('tavily')).toBe('tvly-12345678');
    expect(store.view().tavily.hasKey).toBe(true);
    expect(store.view().tavily.masked).toBe('tvl****5678');

    store.clear('tavily');
    expect(store.get('tavily')).toBeNull();
    expect(store.view().tavily.hasKey).toBe(false);
  });

  it('密文不可解时降级为未配置', () => {
    const db = createDatabase(':memory:');
    const store = createSearchCredentialStore({ db, cipher });
    store.set('brave', 'brave-12345678');

    const broken = createSearchCredentialStore({
      db,
      cipher: { encrypt: cipher.encrypt, decrypt: () => null },
    });
    expect(broken.get('brave')).toBeNull();
    expect(broken.view().brave).toEqual({ hasKey: false, masked: null });
  });
});
