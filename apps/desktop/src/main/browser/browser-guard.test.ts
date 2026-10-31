import { describe, expect, it } from 'vitest';
import { evaluateBrowserUrl, isPrivateHost } from './browser-guard';

const OPEN = { allow: [], deny: [] };

describe('隔离网页 URL / 域名边界（v2.13 M5）', () => {
  it('仅允许 http/https；file/data/javascript 拒绝', () => {
    for (const url of ['file:///C:/secret.txt', 'data:text/html,hi', 'javascript:alert(1)']) {
      expect(evaluateBrowserUrl(url, OPEN)).toMatchObject({ allowed: false, reason: 'URL_REJECTED' });
    }
    expect(evaluateBrowserUrl('https://example.com', OPEN).allowed).toBe(true);
  });

  it('回环 / 私网 / 链路本地地址拒绝', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '[::1]',
    ]) {
      expect(isPrivateHost(host)).toBe(true);
      expect(evaluateBrowserUrl(`http://${host}`, OPEN)).toMatchObject({
        allowed: false,
        reason: 'NAVIGATION_BLOCKED',
      });
    }
    expect(isPrivateHost('example.com')).toBe(false);
  });

  it('deny 优先；allow 非空时仅允许命中项；支持通配后缀', () => {
    const check = evaluateBrowserUrl('https://evil.example.com', {
      allow: ['*.example.com'],
      deny: ['evil.example.com'],
    });
    expect(check).toMatchObject({ allowed: false, reason: 'NAVIGATION_BLOCKED', domain: 'evil.example.com' });

    expect(
      evaluateBrowserUrl('https://other.com', { allow: ['example.com'], deny: [] }),
    ).toMatchObject({ allowed: false, reason: 'NAVIGATION_BLOCKED' });

    expect(
      evaluateBrowserUrl('https://api.example.com', { allow: ['*.example.com'], deny: [] }).allowed,
    ).toBe(true);
  });
});
