import { describe, expect, it } from 'vitest';
import {
  ENDPOINT_KEY_PREFIX,
  endpointKeyPreview,
  generateEndpointKey,
  hashEndpointKey,
  verifyEndpointKey,
} from './endpoint-keys';

describe('endpoint 密钥工具（v0.9）', () => {
  it('生成的密钥带前缀、40 位随机十六进制，两次生成不同', () => {
    const a = generateEndpointKey();
    const b = generateEndpointKey();
    expect(a.key.startsWith(ENDPOINT_KEY_PREFIX)).toBe(true);
    expect(a.key).toHaveLength(ENDPOINT_KEY_PREFIX.length + 40);
    expect(a.key).not.toBe(b.key);
    // 短头只保留前缀 + 8 位
    expect(a.keyPrefix).toBe(`${ENDPOINT_KEY_PREFIX}${a.key.slice(4, 12)}`);
    expect(a.keyPrefix).toHaveLength(ENDPOINT_KEY_PREFIX.length + 8);
  });

  it('hash 稳定且不可逆；verify 对正确密钥通过、错误密钥失败', () => {
    const { key, keyHash } = generateEndpointKey();
    expect(hashEndpointKey(key)).toBe(keyHash);
    expect(hashEndpointKey(key)).toHaveLength(64);
    expect(verifyEndpointKey(key, keyHash)).toBe(true);
    expect(verifyEndpointKey(`${key}x`, keyHash)).toBe(false);
    expect(verifyEndpointKey('', keyHash)).toBe(false);
    expect(verifyEndpointKey(key, `${keyHash}00`)).toBe(false);
  });

  it('preview 为脱敏短头', () => {
    const { key } = generateEndpointKey();
    const preview = endpointKeyPreview(key);
    expect(preview.startsWith(ENDPOINT_KEY_PREFIX)).toBe(true);
    expect(preview.length).toBeLessThan(key.length);
  });
});
