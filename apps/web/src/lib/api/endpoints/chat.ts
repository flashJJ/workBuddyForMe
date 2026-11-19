/** 对话/消息/分支/事件检索相关路径（v4.13 从 endpoints.ts 拆出） */
export const chatApi = {
  conversations: '/api/conversations',
  conversation: (id: string) => `/api/conversations/${id}`,
  messages: (id: string) => `/api/conversations/${id}/messages`,
  /** v2.20：会话/会议过程图快照 */
  conversationRunGraph: (id: string) => `/api/conversations/${id}/run-graph`,
  meetingRunGraph: (id: string) => `/api/meetings/${id}/run-graph`,
  /** v2.20：会话阶段计划与载入任务 */
  stagePlan: (id: string) => `/api/conversations/${id}/stage-plan`,
  stagePlanPrepare: (id: string) => `/api/conversations/${id}/stage-plan/prepare`,
  /** v2.21：分支会话（列表返回 branches + budget） */
  conversationBranches: (id: string) => `/api/conversations/${id}/branches`,
  branch: (id: string) => `/api/branches/${encodeURIComponent(id)}`,
  branchStart: (id: string) => `/api/branches/${encodeURIComponent(id)}/start`,
  branchCancel: (id: string) => `/api/branches/${encodeURIComponent(id)}/cancel`,
  branchArchive: (id: string) => `/api/branches/${encodeURIComponent(id)}/archive`,
  branchRestore: (id: string) => `/api/branches/${encodeURIComponent(id)}/restore`,
  /** v2.22：以终态分支为来源新建分支 */
  branchRetry: (id: string) => `/api/branches/${encodeURIComponent(id)}/retry`,
  branchByChild: (childConversationId: string) =>
    `/api/branches?childConversationId=${encodeURIComponent(childConversationId)}`,
  messageFeedback: (conversationId: string, messageId: string) =>
    `/api/conversations/${conversationId}/messages/${messageId}`,
  runEvidence: '/api/reports/runs',
  /** v2.9 事件日志 / 检索 / 导出 */
  events: (scope: string, scopeId: string, after?: number) =>
    `/api/events?scope=${encodeURIComponent(scope)}&scopeId=${encodeURIComponent(scopeId)}${after ? `&after=${after}` : ''}`,
  /** v4.8：会话上下文立即压缩 */
  conversationCompact: (id: string) => `/api/conversations/${encodeURIComponent(id)}/compact`,
  search: (q: string, scope?: string) =>
    `/api/search?q=${encodeURIComponent(q)}${scope ? `&scope=${encodeURIComponent(scope)}` : ''}`,
  exportSession: (scope: string, scopeId: string, redact = true) =>
    `/api/export/session?scope=${encodeURIComponent(scope)}&scopeId=${encodeURIComponent(scopeId)}&redact=${redact ? '1' : '0'}`,
  chatStream: '/api/chat/stream',
  chatProactive: '/api/chat/proactive',
} as const;
