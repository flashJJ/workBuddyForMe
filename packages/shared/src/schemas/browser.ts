import { z } from 'zod';

/**
 * v2.13 M5：隔离网页会话契约（desktop 主进程控制通道 + core 浏览器工具）。
 * runId 用于「每次任务运行一个独立 session」；域名规则由 core 传入，desktop 在导航 / 重定向时复核。
 */

export const BROWSER_READ_DEFAULT_CHARS = 8000;
export const BROWSER_READ_MAX_CHARS = 20000;
export const BROWSER_URL_MAX = 2048;
export const BROWSER_TITLE_MAX = 200;
export const BROWSER_TEXT_MAX = 20000;

const runIdSchema = z.string().min(1);
const domainRulesSchema = z.array(z.string().max(200)).max(100).default([]);

export const browserOpenRequestSchema = z.object({
  runId: runIdSchema,
  url: z.string().min(1).max(BROWSER_URL_MAX),
  /** 域名 allow/deny（deny 优先；allow 非空时仅允许命中） */
  allowDomains: domainRulesSchema,
  denyDomains: domainRulesSchema,
});
export type BrowserOpenRequest = z.infer<typeof browserOpenRequestSchema>;

export const browserReadRequestSchema = z.object({
  runId: runIdSchema,
  maxChars: z
    .number()
    .int()
    .min(1)
    .max(BROWSER_READ_MAX_CHARS)
    .default(BROWSER_READ_DEFAULT_CHARS),
});
export type BrowserReadRequest = z.infer<typeof browserReadRequestSchema>;

export const browserSnapshotRequestSchema = z.object({ runId: runIdSchema });
export type BrowserSnapshotRequest = z.infer<typeof browserSnapshotRequestSchema>;

export const browserClickRequestSchema = z
  .object({
    runId: runIdSchema,
    selector: z.string().min(1).max(500).optional(),
    text: z.string().min(1).max(500).optional(),
  })
  .refine((value) => value.selector !== undefined || value.text !== undefined, {
    message: 'selector 与 text 至少提供一个',
    path: ['selector'],
  });
export type BrowserClickRequest = z.infer<typeof browserClickRequestSchema>;

export const browserTypeRequestSchema = z
  .object({
    runId: runIdSchema,
    selector: z.string().min(1).max(500).optional(),
    text: z.string().min(1).max(500).optional(),
    value: z.string().min(1).max(4000),
    clear: z.boolean().default(false),
  })
  .refine((input) => input.selector !== undefined || input.text !== undefined, {
    message: 'selector 与 text 至少提供一个',
    path: ['selector'],
  });
export type BrowserTypeRequest = z.infer<typeof browserTypeRequestSchema>;

export const browserCloseRequestSchema = z.object({ runId: runIdSchema });
export type BrowserCloseRequest = z.infer<typeof browserCloseRequestSchema>;

/* ---------------- 响应 ---------------- */

export type BrowserErrorCode =
  | 'URL_REJECTED'
  | 'NAVIGATION_BLOCKED'
  | 'NO_SESSION'
  | 'LOAD_FAILED';

export interface BrowserOpenResponse {
  ok: boolean;
  sessionId?: string;
  domain?: string;
  /** 归一化 URL 的 sha256（只回传哈希，不落完整 URL） */
  urlHash?: string;
  title?: string;
  status?: number;
  error?: BrowserErrorCode;
  blockedDomain?: string;
}

export interface BrowserReadResponse {
  ok: boolean;
  domain?: string;
  urlHash?: string;
  title?: string;
  text?: string;
  truncated?: boolean;
  error?: BrowserErrorCode;
}

export interface BrowserSnapshotResponse {
  ok: boolean;
  domain?: string;
  urlHash?: string;
  imageBase64?: string;
  mimeType?: 'image/png';
  width?: number;
  height?: number;
  error?: BrowserErrorCode;
}

export interface BrowserActionResponse {
  ok: boolean;
  matched?: boolean;
  domain?: string;
  urlHash?: string;
  error?: BrowserErrorCode;
}

export interface BrowserCloseResponse {
  ok: boolean;
  error?: BrowserErrorCode;
}

export const BROWSER_BLOCKED_OUTPUT =
  '网页导航被策略拒绝（域名 / 协议 / 私网边界）。请告知用户该目标不在允许范围内。';

export const BROWSER_UNAVAILABLE_OUTPUT =
  '当前为纯 Web 模式（无桌面端运行）或桌面端控制通道未就绪，隔离网页会话不可用。请告知用户：网页能力仅在桌面端运行时提供。';

export const BROWSER_RUN_REQUIRED_OUTPUT =
  '隔离网页会话仅在任务运行中使用（缺少 runId）。请告知用户通过桌面任务或定时 Agent 任务发起网页操作。';
