import { z } from 'zod';
import {
  BROWSER_BLOCKED_OUTPUT,
  BROWSER_READ_MAX_CHARS,
  BROWSER_RUN_REQUIRED_OUTPUT,
  BROWSER_UNAVAILABLE_OUTPUT,
  BROWSER_URL_MAX,
  type BrowserOpenResponse,
} from '@wbfm/shared/schemas';
import { ChannelUnavailableError } from '../../computer/channel-client';
import type { ToolContext, ToolResult } from '../types';
import { ToolArgError } from '../types';

/** v2.13 M5：浏览器工具共享参数与降级/拒绝输出（外迁守行数门禁） */

export const openArgsSchema = z.object({ url: z.string().min(1).max(BROWSER_URL_MAX) });
export const readArgsSchema = z.object({
  maxChars: z.number().int().min(1).max(BROWSER_READ_MAX_CHARS).optional(),
});
export const emptyArgsSchema = z.object({});
export const clickArgsSchema = z
  .object({
    selector: z.string().min(1).max(500).optional(),
    text: z.string().min(1).max(500).optional(),
  })
  .refine((value) => value.selector !== undefined || value.text !== undefined, {
    message: 'selector 与 text 至少提供一个',
  });
export const typeArgsSchema = z
  .object({
    selector: z.string().min(1).max(500).optional(),
    text: z.string().min(1).max(500).optional(),
    value: z.string().min(1).max(4000),
    clear: z.boolean().optional(),
  })
  .refine((value) => value.selector !== undefined || value.text !== undefined, {
    message: 'selector 与 text 至少提供一个',
  });

export function argError(issues: { message: string }[]): ToolArgError {
  return new ToolArgError(issues.map((issue) => issue.message).join('；'));
}

export function degraded(): ToolResult {
  return { ok: true, output: BROWSER_UNAVAILABLE_OUTPUT, summary: '隔离网页不可用（纯 Web 模式）' };
}

export function noRun(): ToolResult {
  return { ok: true, output: BROWSER_RUN_REQUIRED_OUTPUT, summary: '隔离网页需要任务运行上下文' };
}

export function noSession(): ToolResult {
  return { ok: false, output: '隔离网页会话尚未打开，请先调用 browser_open。', summary: '网页会话不存在' };
}

export function browserFailure(error: string | undefined, domain?: string): ToolResult {
  const text =
    error === 'NAVIGATION_BLOCKED' || error === 'URL_REJECTED'
      ? `${BROWSER_BLOCKED_OUTPUT}${domain ? `（${domain}）` : ''}`
      : `网页操作失败：${error ?? '未知错误'}`;
  return { ok: false, output: text, summary: `网页操作失败（${error ?? 'unknown'}）` };
}

export function auditBlocked(ctx: ToolContext, error: string, domain?: string): void {
  ctx.governanceAudit?.({
    kind: 'policy_denied',
    tool: 'browser_open',
    reasonCode: error,
    ...(domain ? { outcome: `domain:${domain}` } : {}),
  });
}

export async function call<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ChannelUnavailableError) return null;
    throw error;
  }
}

export function summaryOfOpen(response: BrowserOpenResponse): string {
  return `已打开 ${response.domain ?? '网页'}`;
}
