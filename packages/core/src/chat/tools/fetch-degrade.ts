import type { ToolResult } from '../../tools/types';

/** 同一 URL 连续失败达到该次数后本轮不再重试，改为降级作答 */
export const FETCH_DEGRADE_THRESHOLD = 2;

/** 可降级的失败类型：网络/超时/页面过大；鉴权与被拒保持原语义 */
const RETRYABLE_RE =
  /超时|timeout|连接|network|fetch|ECONN|ENOTFOUND|EAI_AGAIN|过大|too large|超过.*上限/i;

/** 从工具参数提取抓取目标 URL（无效或缺省返回 null） */
export function fetchUrlOf(args: unknown): string | null {
  if (!args || typeof args !== 'object') return null;
  const url = (args as Record<string, unknown>).url;
  return typeof url === 'string' && url.trim() ? url.trim() : null;
}

/** 本次失败是否属于可降级类别（成功或已降级的不再累计） */
export function shouldDegradeFetch(result: ToolResult): boolean {
  if (result.ok || result.degraded) return false;
  return RETRYABLE_RE.test(`${result.output} ${result.summary}`);
}

/** 可恢复失败特征：只有这类失败才计入工具熔断，避免确定性失败锁死工具 */
const TRANSIENT_BREAKER_RE =
  /超时|timeout|连接|network|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|HTTP 5\d\d|HTTP 429|限流|rate limit|服务(?:不可用|异常)/i;

/**
 * 熔断计数判定：成功恒计数（用于清零）；fetch_webpage 的确定性失败
 * （页面过大、4xx、SSRF、内容类型不支持等）不计入，重试不会变好。
 */
export function shouldCountBreakerFailure(toolName: string, result: ToolResult): boolean {
  if (result.ok) return true;
  if (toolName !== 'fetch_webpage') return true;
  return TRANSIENT_BREAKER_RE.test(`${result.output} ${result.summary}`);
}

/** 达到上限后的跳过结果：告诉模型改用已获搜索摘要成文 */
export function degradedFetchResult(url: string): ToolResult {
  return {
    ok: false,
    degraded: true,
    output: `同一链接本轮已连续失败 ${FETCH_DEGRADE_THRESHOLD} 次，不再重试：${url}。请基于已获得的搜索摘要作答，并说明未取到全文。`,
    summary: '已跳过重复抓取',
    evidence: {
      source: url,
      coverage: '未获取正文',
      limitations: ['同一链接重复失败，已降级'],
      capturedAt: new Date().toISOString(),
    },
  };
}
