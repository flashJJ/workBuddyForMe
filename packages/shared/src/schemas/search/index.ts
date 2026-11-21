import { z } from 'zod';

/**
 * v4.18 C 线：跨域检索结果契约。
 *
 * 会话/任务/流程/会议来自追加式事件日志（session_events），
 * 知识来自文档表（标题/来源/摘要），不做正文级或向量检索。
 */

export const SEARCH_DOMAINS = ['chat', 'task', 'flow', 'meeting', 'knowledge'] as const;
export type SearchDomain = (typeof SEARCH_DOMAINS)[number];

/** 走事件日志的四域；knowledge 不在 session_events 内 */
export const SEARCH_EVENT_DOMAINS = ['chat', 'task', 'flow', 'meeting'] as const;
export type SearchEventDomain = (typeof SEARCH_EVENT_DOMAINS)[number];

/** open=打开详情；resume=继续任务/流程；copy=复制引用 */
export const SEARCH_ACTIONS = ['open', 'resume', 'copy'] as const;
export type SearchAction = (typeof SEARCH_ACTIONS)[number];

/** 单域最多 10 条、总计最多 50 条；知识库单库 5 条、并发 4 */
export const SEARCH_LIMITS = {
  perDomain: 10,
  total: 50,
  knowledgePerBase: 5,
  knowledgeConcurrency: 4,
} as const;

/** 少于 2 个字符不发起检索（与 v4.17 消息检索一致） */
export const SEARCH_MIN_QUERY_LENGTH = 2;

/** 片段只做单行压缩，最多 240 字符，不返回正文 */
export const SEARCH_SNIPPET_MAX = 240;

export const searchResultSchema = z.object({
  domain: z.enum(SEARCH_DOMAINS),
  /** 域内稳定标识：事件 id / 消息 id / 文档 id */
  id: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  snippet: z.string().max(SEARCH_SNIPPET_MAX).default(''),
  /** ISO 时间；无可靠时间时为 null */
  timestamp: z.string().datetime({ offset: true }).nullable(),
  /** 站内深链；不拼接本机绝对路径 */
  deepLink: z.string().trim().min(1).max(2048),
  action: z.enum(SEARCH_ACTIONS),
});

export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchGroupSchema = z.object({
  domain: z.enum(SEARCH_DOMAINS),
  results: z.array(searchResultSchema).max(SEARCH_LIMITS.perDomain),
  /** 该域失败时为 true；其他域仍返回（错误隔离） */
  failed: z.boolean().default(false),
});

export type SearchGroup = z.infer<typeof searchGroupSchema>;

export const searchResponseSchema = z.object({
  query: z.string().trim().min(1),
  groups: z.array(searchGroupSchema).max(SEARCH_DOMAINS.length),
  total: z.number().int().min(0).max(SEARCH_LIMITS.total),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;
