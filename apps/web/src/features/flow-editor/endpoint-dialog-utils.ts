import {
  FLOW_DESKTOP_CONTROL_TOOLS,
  FLOW_ENDPOINT_RATE_LIMIT,
} from '@wbfm/shared/schemas';
import { type FlowUnattendedPolicy } from '@wbfm/shared/types';

export const TIMEOUT_OPTIONS = [5_000, 10_000, 30_000, 60_000, 120_000];

/** 对外服务 API 的本机基础地址（SSR 下回退到默认端口） */
export function getEndpointBaseUrl(): string {
  return typeof window === 'undefined'
    ? 'http://127.0.0.1:3000/api/public'
    : `${window.location.origin}/api/public`;
}

/** 调用示例 curl（shownKey 为明文密钥或占位符） */
export function buildCurlExample(baseUrl: string, shownKey: string): string {
  return `curl -X POST ${baseUrl}/flows/${shownKey}/invoke \\
  -H "Authorization: Bearer ${shownKey}" \\
  -H "Content-Type: application/json" \\
  -d '{}'`;
}

/** 速率限制收敛到 [min, max]，非法值回退默认值 */
export function clampRateLimit(rateLimit: number): number {
  return Math.min(
    FLOW_ENDPOINT_RATE_LIMIT.max,
    Math.max(FLOW_ENDPOINT_RATE_LIMIT.min, Math.floor(rateLimit) || FLOW_ENDPOINT_RATE_LIMIT.default),
  );
}

/**
 * 白名单只提交当前发布图中仍存在的非桌面类危险工具，防止残留已删节点工具名
 */
export function buildEffectivePolicy(
  policy: FlowUnattendedPolicy,
  graphTools: ReadonlySet<string>,
): FlowUnattendedPolicy {
  return policy.mode === 'allowlist'
    ? {
        mode: 'allowlist',
        allowed: policy.allowed.filter(
          (name) => graphTools.has(name) && !FLOW_DESKTOP_CONTROL_TOOLS.includes(name as never),
        ),
      }
    : { mode: 'deny_all' };
}
