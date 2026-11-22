/**
 * v4.22 Controller Pipeline 契约（M0 冻结）：
 * 上下文装配从「一个函数顺序拼字符串」拆成 Source → Collector → Packer 三段，
 * 每段都是纯能力：来源只管采集、收集器只管并发与容错、装包只管排序去重与预算。
 */

/** 内置上下文来源标识 */
export type ContextSourceId =
  | 'conversation-summary'
  | 'conversation-facts'
  | 'active-plan'
  | 'recent-messages'
  | 'long-term-memory';

/** 单个上下文片段（已含标题的纯文本） */
export interface ContextFragment {
  /** 片段唯一键：同 key 只保留最高优先级来源的一条 */
  key: string;
  source: ContextSourceId;
  /** 数值越小优先级越高；同优先级按采集顺序稳定排列 */
  priority: number;
  /** 片段正文（含标题，不含分隔符） */
  text: string;
  /** 该片段与其后片段之间的分隔符，缺省用装包选项的 separator */
  separator?: string;
}

/** 一次装配请求（与 buildTaskContextBlock 入参对齐） */
export interface ContextCollectRequest {
  conversationId: string | null;
  goal: string;
  assistantId?: string | null;
  contextWindow?: number | null;
  budgetTokens?: number;
  signal?: AbortSignal;
}

/** 上下文来源：注册即可扩展，不改装配主流程 */
export interface ContextSource {
  id: ContextSourceId;
  priority: number;
  /** 返回 false 时记 skipped，不调用 collect */
  enabled?: (request: ContextCollectRequest) => boolean;
  collect(request: ContextCollectRequest): Promise<ContextFragment[]> | ContextFragment[];
}

/** 单来源采集结果（观测用） */
export interface ContextSourceStatus {
  id: ContextSourceId;
  status: 'ok' | 'empty' | 'skipped' | 'failed';
  fragments: number;
  durationMs: number;
}

export interface ContextCollectResult {
  fragments: ContextFragment[];
  sources: ContextSourceStatus[];
}

export interface ContextPackOptions {
  budgetTokens: number;
  separator?: string;
}

export interface ContextPackResult {
  /** 装包后的完整文本；无可用片段时为 null */
  text: string | null;
  /** 保留的片段数 */
  fragments: number;
  /** 被丢弃（重复或超预算）的片段数 */
  dropped: number;
  /** 是否对末段做了 token 截断 */
  truncated: boolean;
}
