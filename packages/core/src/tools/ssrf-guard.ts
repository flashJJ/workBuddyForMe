import { promises as dns } from 'node:dns';

/**
 * SSRF 防护（fetch_webpage 专用）：
 * 拒绝回环/私网/链路本地/云元数据等内网地址，防止模型诱导服务端打本机服务。
 * 纯函数部分（IP 判定）完整单测覆盖；DNS 解析在抓取入口调用。
 */

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

/** 把 IPv4 点分字符串转为无符号 32 位整数；非法返回 null */
export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function inCidr(ipInt: number, base: string, bits: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/** 必拦的 IPv4 段（回环/私网/链路本地/元数据/保留/多播） */
const BLOCKED_V4_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // 本网段
  ['10.0.0.0', 8], // 私网
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // 回环
  ['169.254.0.0', 16], // 链路本地（含 169.254.169.254 云元数据）
  ['172.16.0.0', 12], // 私网
  ['192.0.0.0', 24],
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 中继任播
  ['192.168.0.0', 16], // 私网
  ['198.18.0.0', 15], // 基准测试
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // 多播
  ['240.0.0.0', 4], // 保留
];

/** IPv6 展开为 16 字节数组；支持 :: 与 ::ffff:v4 映射；非法返回 null */
export function parseIpv6(ip: string): number[] | null {
  let value = ip.toLowerCase();
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1);
  // IPv4-mapped / compatible 尾段：::ffff:127.0.0.1
  const v4Tail = value.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (v4Tail) {
    const v4 = ipv4ToInt(v4Tail[1]!);
    if (v4 === null) return null;
    const high = ((v4 >>> 16) & 0xffff).toString(16);
    const low = (v4 & 0xffff).toString(16);
    value = value.replace(v4Tail[0]!, `:${high}:${low}`);
  }
  const doubleColon = value.indexOf('::');
  let groups: string[];
  if (doubleColon !== -1) {
    const [head, tail] = value.split('::');
    const headParts = head ? head.split(':') : [];
    const tailParts = tail ? tail.split(':') : [];
    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 0) return null;
    groups = [...headParts, ...Array(missing).fill('0'), ...tailParts];
  } else {
    groups = value.split(':');
  }
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const n = parseInt(group, 16);
    bytes.push((n >>> 8) & 0xff, n & 0xff);
  }
  return bytes;
}

function isBlockedIpv6(bytes: number[]): boolean {
  // :: 未指定、::1 回环
  if (bytes.every((b) => b === 0)) return true;
  if (bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1) return true;
  const first = bytes[0]!;
  if ((first & 0xfe) === 0xfc) return true; // fc00::/7 唯一本地
  if (first === 0xfe && (bytes[1]! & 0xc0) === 0x80) return true; // fe80::/10 链路本地
  if (first === 0xff) return true; // ff00::/8 多播
  // ::ffff:0:0/96 IPv4-mapped：按内嵌 v4 判定
  if (bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    const dotted = `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
    return isBlockedIpv4(dotted).blocked;
  }
  return false;
}

export interface IpCheckResult {
  blocked: boolean;
  reason?: string;
}

/** 判定单个 IP 是否应拦截（v4/v6 自动识别） */
export function isBlockedIp(ip: string): IpCheckResult {
  const v4 = ipv4ToInt(ip);
  if (v4 !== null) return isBlockedIpv4(ip);
  const v6 = parseIpv6(ip);
  if (!v6) return { blocked: true, reason: `无法解析的 IP 字面量：${ip}` };
  if (isBlockedIpv6(v6)) return { blocked: true, reason: `IPv6 内网/保留地址：${ip}` };
  return { blocked: false };
}

function isBlockedIpv4(ip: string): IpCheckResult {
  const value = ipv4ToInt(ip);
  if (value === null) return { blocked: true, reason: `非法 IPv4：${ip}` };
  for (const [base, bits] of BLOCKED_V4_CIDRS) {
    if (inCidr(value, base, bits)) {
      return { blocked: true, reason: `目标地址 ${ip} 命中内网/保留网段 ${base}/${bits}` };
    }
  }
  return { blocked: false };
}

/**
 * URL 静态校验：协议白名单 + 主机名为 IP 字面量时直接判定。
 * 主机名为域名时，调用方需再走 resolveAndAssertHost 做 DNS 校验。
 */
export function assertSafeUrlLiteral(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new SsrfBlockedError(`非法 URL：${urlString}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError(`仅允许 http/https 协议：${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const ipCheck = isBlockedIp(host);
  // 字面量能被解析为合法 IP 且未拦截才放行；解析失败说明是域名，交给 DNS 阶段
  if (ipv4ToInt(host) !== null || host.includes(':')) {
    if (ipCheck.blocked) throw new SsrfBlockedError(ipCheck.reason ?? '目标地址被拦截');
  }
  return url;
}

/** DNS 解析域名并断言所有解析结果均为公网地址（防 DNS rebinding 的解析时校验） */
export async function resolveAndAssertHost(hostname: string): Promise<void> {
  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0) throw new SsrfBlockedError(`域名解析无结果：${hostname}`);
  for (const record of records) {
    const check = isBlockedIp(record.address);
    if (check.blocked) throw new SsrfBlockedError(check.reason ?? `域名解析到内网地址：${record.address}`);
  }
}
