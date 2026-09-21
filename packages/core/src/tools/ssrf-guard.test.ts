import { describe, expect, it } from 'vitest';
import {
  assertSafeUrlLiteral,
  ipv4ToInt,
  isBlockedIp,
  parseIpv6,
  SsrfBlockedError,
} from './ssrf-guard';

describe('SSRF 防护：IPv4 判定', () => {
  it.each([
    ['127.0.0.1', true],
    ['127.1.2.3', true],
    ['10.0.0.1', true],
    ['10.255.255.255', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.15.0.1', false],
    ['172.32.0.1', false],
    ['192.168.1.1', true],
    ['169.254.169.254', true], // 云元数据
    ['0.0.0.0', true],
    ['100.64.0.1', true], // CGNAT
    ['224.0.0.1', true], // 多播
    ['240.0.0.1', true], // 保留
    ['8.8.8.8', false],
    ['110.242.68.66', false],
    ['999.1.1.1', true], // 非法
    ['1.2.3', true], // 非法
  ])('isBlockedIp(%s) => %s', (ip, expected) => {
    expect(isBlockedIp(ip).blocked).toBe(expected);
  });

  it('ipv4ToInt 无符号转换', () => {
    expect(ipv4ToInt('127.0.0.1')).toBe(0x7f000001);
    expect(ipv4ToInt('255.255.255.255')).toBe(0xffffffff);
    expect(ipv4ToInt('a.b.c.d')).toBeNull();
  });
});

describe('SSRF 防护：IPv6 判定', () => {
  it.each([
    ['::1', true], // 回环
    ['::', true], // 未指定
    ['fc00::1', true], // 唯一本地
    ['fd12:3456:789a::1', true],
    ['fe80::1', true], // 链路本地
    ['ff02::1', true], // 多播
    ['::ffff:127.0.0.1', true], // v4 映射回环
    ['::ffff:192.168.0.1', true], // v4 映射私网
    ['::ffff:169.254.169.254', true], // v4 映射元数据
    ['::ffff:8.8.8.8', false], // v4 映射公网放行
    ['2606:4700:4700::1111', false], // 公网
  ])('isBlockedIp(%s) => %s', (ip, expected) => {
    expect(isBlockedIp(ip).blocked).toBe(expected);
  });

  it('parseIpv6 展开 :: 与方括号', () => {
    expect(parseIpv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6('[2001:db8::1]')?.at(-1)).toBe(1);
    expect(parseIpv6('::ffff:127.0.0.1')?.slice(-4)).toEqual([127, 0, 0, 1]);
    expect(parseIpv6('gggg::1')).toBeNull();
    expect(parseIpv6('1:2:3:4:5:6:7:8:9')).toBeNull();
  });
});

describe('SSRF 防护：URL 字面量校验', () => {
  it('公网 http/https 放行，返回 URL 对象', () => {
    expect(assertSafeUrlLiteral('https://example.com/path').hostname).toBe('example.com');
    expect(assertSafeUrlLiteral('http://8.8.8.8/x').hostname).toBe('8.8.8.8');
  });

  it('内网 IP 字面量直接拦截', () => {
    expect(() => assertSafeUrlLiteral('http://127.0.0.1:3000/')).toThrow(SsrfBlockedError);
    expect(() => assertSafeUrlLiteral('http://[::1]/')).toThrow(SsrfBlockedError);
    expect(() => assertSafeUrlLiteral('http://169.254.169.254/latest/meta-data')).toThrow(
      SsrfBlockedError,
    );
  });

  it('非 http(s) 协议与非法 URL 拦截（防 file://、gopher:// 等）', () => {
    expect(() => assertSafeUrlLiteral('file:///etc/passwd')).toThrow(SsrfBlockedError);
    expect(() => assertSafeUrlLiteral('ftp://8.8.8.8/')).toThrow(SsrfBlockedError);
    expect(() => assertSafeUrlLiteral('not a url')).toThrow(SsrfBlockedError);
  });
});
