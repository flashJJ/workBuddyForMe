import { matchesDomainRule } from '@wbfm/shared/schemas';

/** v2.13 M5：隔离网页 URL / 域名 / 私网边界（纯函数，desktop 与测试共用） */

export interface BrowserDomainRules {
  allow: string[];
  deny: string[];
}

export type BrowserUrlCheck =
  | { allowed: true; url: URL; domain: string }
  | { allowed: false; reason: 'URL_REJECTED' | 'NAVIGATION_BLOCKED'; domain?: string };

const PRIVATE_HOST_PATTERN =
  /^(localhost|127\.|0\.0\.0\.0|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1$|\[::1\]|fc00|fd00|fe80|::ffff:127\.)/i;

export function isPrivateHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return PRIVATE_HOST_PATTERN.test(host);
}

/** 协议 + 私网字面量 + 域名 allow/deny（deny 优先） */
export function evaluateBrowserUrl(raw: string, rules: BrowserDomainRules): BrowserUrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { allowed: false, reason: 'URL_REJECTED' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { allowed: false, reason: 'URL_REJECTED' };
  }
  const domain = url.hostname.toLowerCase();
  if (!domain || isPrivateHost(domain)) {
    return { allowed: false, reason: 'NAVIGATION_BLOCKED', domain };
  }
  if (rules.deny.some((rule) => matchesDomainRule(rule, domain))) {
    return { allowed: false, reason: 'NAVIGATION_BLOCKED', domain };
  }
  if (rules.allow.length > 0 && !rules.allow.some((rule) => matchesDomainRule(rule, domain))) {
    return { allowed: false, reason: 'NAVIGATION_BLOCKED', domain };
  }
  return { allowed: true, url, domain };
}
