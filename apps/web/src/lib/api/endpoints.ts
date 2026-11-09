/** API 路径集中常量，避免页面散落魔法字符串 */
export const API = {
  providers: '/api/providers',
  provider: (id: string) => `/api/providers/${id}`,
  providerTest: (id: string) => `/api/providers/${id}/test`,
  /** v2.17：联网搜索连接测试 */
  searchTest: '/api/search/test',
  /** v2.24：Brave / Tavily 搜索密钥（GET 脱敏状态 / PUT 保存 / DELETE 清除） */
  searchCredential: '/api/search/credential',
  /** v2.4 M1 T5：首字延迟自检 */
  providerFirstToken: (id: string) => `/api/providers/${id}/first-token-probe`,
  providerModels: (id: string) => `/api/providers/${id}/models`,
  model: (id: string) => `/api/models/${id}`,
  settings: '/api/settings',
  /** v2.4 M1：本机 Ollama 提前探测（向导来源置顶） */
  systemOllama: '/api/system/ollama',
  /** v2.4 T4：本机 Ollama 推荐模型一键拉取（SSE 进度） */
  systemOllamaPull: '/api/system/ollama/pull',
  assistants: '/api/assistants',
  assistant: (id: string) => `/api/assistants/${id}`,
  assistantReorder: '/api/assistants/reorder',
  // v1.8 角色卡库
  characterCards: '/api/character-cards',
  characterCard: (id: string) => `/api/character-cards/${id}`,
  characterCardDuplicate: (id: string) => `/api/character-cards/${id}/duplicate`,
  characterCardRaw: (id: string) => `/api/character-cards/${id}/raw`,
  assistantCard: (id: string) => `/api/assistants/${id}/card`,
  // v1.9 舞台场景
  stageScenes: '/api/stage-scenes',
  stageScene: (id: string) => `/api/stage-scenes/${id}`,
  stageBackgrounds: '/api/stage-scenes/backgrounds',
  stageBackground: (ref: string) => `/api/stage-scenes/backgrounds/${ref}`,
  // v2.0 M5 个性化内容包
  modPackCandidates: '/api/mod-packs/candidates',
  modPackInspect: '/api/mod-packs/inspect',
  modPackImport: '/api/mod-packs/import',
  modPackExport: '/api/mod-packs/export',
  modPackInstalls: '/api/mod-packs/installs',
  relationshipReport: '/api/relationship-report',
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
  /** v2.11：启用中的能力包剧本（短语触发匹配） */
  eventScripts: '/api/event-scripts',
  /** v2.11：外部代理（本地 CLI） */
  subagentProviders: '/api/subagents/providers',
  subagentRuns: '/api/subagents/runs',
  subagentRunCancel: (id: string) => `/api/subagents/runs/${encodeURIComponent(id)}/cancel`,
  // v2.7 工作信号 / 审批中心
  workSignals: '/api/work-signals',
  approvals: '/api/approvals',
  approvalResolve: (id: string) => `/api/approvals/${encodeURIComponent(id)}/resolve`,
  // v2.13 M3 审计账本
  auditEvents: '/api/audit/events',
  auditVerify: '/api/audit/verify',
  auditExport: (format = 'jsonl') => `/api/audit/export?format=${format}`,
  /** v2.15：区间归档 ZIP 与外部锚点校验 */
  auditArchive: (from: string, to: string) =>
    `/api/audit/archive?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  auditAnchorVerify: '/api/audit/anchor/verify',
  // v2.15 凭证轮换
  secretRotate: '/api/secrets/rotate',
  // v2.8 目标 / 计划 / 待办
  goals: '/api/goals',
  goalsByConversation: (conversationId: string) =>
    `/api/goals?conversationId=${encodeURIComponent(conversationId)}`,
  goal: (id: string) => `/api/goals/${encodeURIComponent(id)}`,
  workPlans: '/api/work-plans',
  workPlansByConversation: (conversationId: string) =>
    `/api/work-plans?conversationId=${encodeURIComponent(conversationId)}`,
  workPlan: (id: string) => `/api/work-plans/${encodeURIComponent(id)}`,
  workPlanReview: (id: string) => `/api/work-plans/${encodeURIComponent(id)}/review`,
  workPlanStep: (id: string, stepId: string) =>
    `/api/work-plans/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}`,
  // v2.10 能力包
  capabilities: '/api/capabilities',
  capabilityInstall: '/api/capabilities/install',
  capabilityEnable: (id: string) => `/api/capabilities/${encodeURIComponent(id)}/enable`,
  capabilityDisable: (id: string) => `/api/capabilities/${encodeURIComponent(id)}/disable`,
  capabilityUpgrade: (id: string) => `/api/capabilities/${encodeURIComponent(id)}/upgrade`,
  capabilityHealth: '/api/capabilities/health',
  capabilityHealthCleanup: '/api/capabilities/health/cleanup',
  capability: (id: string) => `/api/capabilities/${encodeURIComponent(id)}`,
  capabilitySample: '/api/capabilities/sample',
  // v2.9 事件日志 / 检索 / 导出
  events: (scope: string, scopeId: string, after?: number) =>
    `/api/events?scope=${encodeURIComponent(scope)}&scopeId=${encodeURIComponent(scopeId)}${after ? `&after=${after}` : ''}`,
  search: (q: string, scope?: string) =>
    `/api/search?q=${encodeURIComponent(q)}${scope ? `&scope=${encodeURIComponent(scope)}` : ''}`,
  exportSession: (scope: string, scopeId: string, redact = true) =>
    `/api/export/session?scope=${encodeURIComponent(scope)}&scopeId=${encodeURIComponent(scopeId)}&redact=${redact ? '1' : '0'}`,
  spill: (hash: string) => `/api/spills/${encodeURIComponent(hash)}`,
  chatStream: '/api/chat/stream',
  chatProactive: '/api/chat/proactive',
  knowledgeBases: '/api/knowledge-bases',
  /** v2.18 M4：示例内容包清单与导入 */
  contentPacks: '/api/content-packs',
  contentPackImport: '/api/content-packs/import',
  /** v2.30：内容包更新检查（手动触发） */
  contentPackUpdateCheck: (id: string) => `/api/content-packs/${id}/update-check`,
  knowledgeBase: (id: string) => `/api/knowledge-bases/${id}`,
  documents: (kbId: string) => `/api/knowledge-bases/${kbId}/documents`,
  kbConflicts: (kbId: string) => `/api/knowledge-bases/${kbId}/conflicts`,
  kbDuplicates: (kbId: string) => `/api/knowledge-bases/${kbId}/duplicates`,
  kbCompileStatus: (kbId: string) => `/api/knowledge-bases/${kbId}/compile-status`,
  kbCompile: (kbId: string) => `/api/knowledge-bases/${kbId}/compile`,
  kbCompileEvents: (kbId: string) => `/api/knowledge-bases/${kbId}/compile/events`,
  kbCompileCancel: (kbId: string) => `/api/knowledge-bases/${kbId}/compile/cancel`,
  clip: (kbId: string) => `/api/knowledge-bases/${kbId}/clip`,
  document: (id: string) => `/api/documents/${id}`,
  documentStructure: (id: string) => `/api/documents/${id}/structure`,
  documentReparse: (id: string) => `/api/documents/${id}/reparse`,
  /** v2.29：批量重解析队列（start/pause/resume/cancel + 状态） */
  kbReparseBatch: (kbId: string) => `/api/knowledge-bases/${kbId}/reparse-batch`,
  documentFigureSummary: (id: string) => `/api/documents/${id}/figure-summary`,
  /** v2.19：跨文档章节/表格对比产物 */
  documentCompare: '/api/documents/compare',
  attachments: '/api/attachments',
  attachment: (id: string) => `/api/attachments/${id}`,
  /** v2.32：产物清单与批量打包 */
  artifacts: '/api/artifacts',
  artifactsExport: '/api/artifacts/export',
  /** v2.32：存储占用统计与孤儿附件回收 */
  storageUsage: '/api/storage/usage',
  storageOrphansScan: '/api/storage/orphans/scan',
  storageOrphansTrash: '/api/storage/orphans/trash',
  storageTrash: '/api/storage/trash',
  storageTrashRestore: '/api/storage/trash/restore',
  storageTrashPurge: '/api/storage/trash/purge',
  memories: '/api/memories',
  memory: (id: string) => `/api/memories/${id}`,
  memoryClear: '/api/memories/clear',
  /** v2.28：记忆线上计数（设置页统计卡） */
  memoryStats: '/api/memories/stats',
  /** v2.31：手动触发记忆空闲整理 */
  memoryConsolidate: '/api/memories/consolidate',
  mcpServers: '/api/mcp/servers',
  mcpServer: (id: string) => `/api/mcp/servers/${id}`,
  /** v2.24：安装前运行环境探测 */
  mcpRuntime: '/api/mcp/runtime',
  /** v2.24：远程 MCP OAuth 状态 / 发起 / 清除 */
  mcpOAuthStatuses: '/api/mcp/oauth/statuses',
  mcpServerOAuth: (id: string) => `/api/mcp/servers/${id}/oauth`,
  /** v2.3：手动测试连接（重连并等待终态） */
  mcpServerTest: (id: string) => `/api/mcp/servers/${id}/test`,
  mcpTools: '/api/mcp/tools',
  skills: '/api/skills',
  skill: (id: string) => `/api/skills/${id}`,
  /** v2.14：技能版本快照列表与回退 */
  skillVersions: (name: string) => `/api/skills/${encodeURIComponent(name)}/versions`,
  skillVersionRollback: (name: string, version: string) =>
    `/api/skills/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}/rollback`,
  /** v2.15：删除非启用版本快照 */
  skillVersionDelete: (name: string, version: string) =>
    `/api/skills/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`,
  toolConfirm: '/api/tools/confirm',
  toolPermissions: '/api/tools/permissions',
  toolPermission: (id: string) => `/api/tools/permissions/${id}`,
  toolBreakers: '/api/tools/breakers',
  toolDebug: '/api/tools/debug',
  /** v2.14：脱敏诊断包下载（本地生成，不上传） */
  diagnosticsExport: '/api/diagnostics/export',
  tasks: '/api/tasks',
  taskList: (conversationId: string) => `/api/tasks?conversationId=${conversationId}`,
  task: (id: string) => `/api/tasks/${id}`,
  taskEvents: (id: string) => `/api/tasks/${id}/events`,
  taskControl: (id: string) => `/api/tasks/${id}/control`,
  taskStopAll: '/api/tasks/stop-all',
  // v1.4 多智能体协作；v1.9 M2 observe=1 为舞台只读第二客户端
  agentRuns: '/api/agent/runs',
  agentRun: (id: string) => `/api/agent/runs/${id}`,
  agentRunEvents: (id: string, observe = false) =>
    `/api/agent/runs/${id}/events${observe ? '?observe=1' : ''}`,
  agentRunCancel: (id: string) => `/api/agent/runs/${id}/cancel`,
  // v1.9 M3 多助手会议
  meetings: '/api/meetings',
  meeting: (id: string) => `/api/meetings/${id}`,
  meetingTurns: (id: string) => `/api/meetings/${id}/turns`,
  meetingMode: (id: string) => `/api/meetings/${id}/mode`,
  meetingFinish: (id: string) => `/api/meetings/${id}/finish`,
  meetingAbort: (id: string) => `/api/meetings/${id}/abort`,
  meetingEvents: (id: string) => `/api/meetings/${id}/events`,
  meetingConclusion: (id: string) => `/api/meetings/${id}/conclusion`,
  meetingActionItems: (id: string) => `/api/meetings/${id}/action-items`,
  meetingActionItem: (id: string, itemId: string) =>
    `/api/meetings/${id}/action-items/${itemId}`,
  meetingActionItemReminder: (id: string, itemId: string) =>
    `/api/meetings/${id}/action-items/${itemId}/to-reminder`,
  meetingActionItemRunFlow: (id: string, itemId: string) =>
    `/api/meetings/${id}/action-items/${itemId}/run-flow`,
  meetingExport: (id: string) => `/api/meetings/${id}/export`,
  // v0.8 Flow Studio
  flows: '/api/flows',
  flow: (id: string) => `/api/flows/${id}`,
  /** v2.4 P0-2：以内置工作流为模板复制草稿 */
  flowClone: (id: string) => `/api/flows/${id}/clone`,
  flowVersions: (id: string) => `/api/flows/${id}/versions`,
  /** v2.15：版本差异摘要 */
  flowVersionCompare: (id: string, from: number, to: number) =>
    `/api/flows/${id}/versions/compare?from=${from}&to=${to}`,
  flowValidate: (id: string) => `/api/flows/${id}/validate`,
  flowPublish: (id: string) => `/api/flows/${id}/publish`,
  /** v2.14：把历史版本设为生产（不改当前草稿） */
  flowProduction: (id: string) => `/api/flows/${id}/production`,
  flowRuns: (id: string) => `/api/flows/${id}/runs`,
  flowRun: (runId: string) => `/api/flows/runs/${runId}`,
  flowRunEvents: (runId: string) => `/api/flows/runs/${runId}/events`,
  flowRunHuman: (runId: string) => `/api/flows/runs/${runId}/human`,
  flowRunToolConfirm: (runId: string) => `/api/flows/runs/${runId}/tool-confirm`,
  flowRunControl: (runId: string) => `/api/flows/runs/${runId}/control`,
  // v0.9 对外服务端点（内部管理面）
  flowEndpoint: (id: string) => `/api/flows/${id}/endpoint`,
  flowEndpointRotate: (id: string) => `/api/flows/${id}/endpoint/rotate`,
  // v0.9 M4 运行记录与重放
  flowRunsCenter: '/api/flow-runs',
  flowRunReplay: (runId: string) => `/api/flows/runs/${runId}/replay`,
  // v1.0 语音
  voiceSettings: '/api/voice/settings',
  voiceTts: '/api/voice/tts',
  voiceAsr: '/api/voice/asr',
  /** v2.25：PTT 识别结果润色（无模型/超时回退原文） */
  voicePolish: '/api/voice/polish',
  voiceModelStatus: '/api/voice/models/status',
  voiceModelDownload: '/api/voice/models/download',
} as const;

export const QUERY_KEYS = {
  providers: ['providers'] as const,
  models: (providerId: string) => ['models', providerId] as const,
  modelsAll: ['models', 'all'] as const,
  settings: ['settings'] as const,
  ollamaProbe: ['ollama-probe'] as const,
  assistants: ['assistants'] as const,
  characterCards: ['character-cards'] as const,
  stageScenes: ['stage-scenes'] as const,
  conversations: ['conversations'] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
  knowledgeBases: ['knowledge-bases'] as const,
  contentPacks: ['content-packs'] as const,
  documents: (kbId: string) => ['documents', kbId] as const,
  documentStructure: (documentId: string) => ['document-structure', documentId] as const,
  kbGovernance: (kbId: string) => ['kb-governance', kbId] as const,
  kbCompileStatus: (kbId: string) => ['kb-compile-status', kbId] as const,
  kbReparseBatch: (kbId: string) => ['kb-reparse-batch', kbId] as const,
  attachment: (id: string) => ['attachment', id] as const,
  memories: ['memories'] as const,
  memoryStats: ['memories', 'stats'] as const,
  mcpServers: ['mcp-servers'] as const,
  mcpTools: ['mcp-tools'] as const,
  mcpRuntime: ['mcp-runtime'] as const,
  mcpOAuthStatuses: ['mcp-oauth-statuses'] as const,
  searchCredentials: ['search-credentials'] as const,
  skills: ['skills'] as const,
  skillVersions: (name: string) => ['skills', name, 'versions'] as const,
  toolPermissions: ['tool-permissions'] as const,
  toolBreakers: ['tool-breakers'] as const,
  toolDebug: ['tool-debug'] as const,
  approvals: ['approvals'] as const,
  audit: (filter: Record<string, string | number | undefined>) =>
    ['audit', filter] as const,
  taskAudit: (runId: string) => ['audit', 'task', runId] as const,
  subagentProviders: ['subagent-providers'] as const,
  subagentRuns: ['subagent-runs'] as const,
  capabilities: ['capabilities'] as const,
  capabilityHealth: ['capabilities', 'health'] as const,
  events: (scope: string, scopeId: string) => ['events', scope, scopeId] as const,
  runGraph: (kind: 'conversation' | 'meeting', id: string) => ['run-graph', kind, id] as const,
  stagePlan: (id: string) => ['stage-plan', id] as const,
  /** v2.21：分支列表（含预算）与子会话来源分支 */
  branches: (conversationId: string) => ['branches', conversationId] as const,
  branchByChild: (childConversationId: string) => ['branch-by-child', childConversationId] as const,
  eventSearch: (q: string, scope: string) => ['event-search', q, scope] as const,
  goals: (conversationId: string) => ['goals', conversationId] as const,
  workPlans: (conversationId?: string) =>
    ['work-plans', conversationId ?? 'all'] as const,
  tasks: ['tasks'] as const,
  tasksByConversation: (conversationId: string) =>
    ['tasks', { conversationId }] as const,
  task: (id: string) => ['task', id] as const,
  agentRuns: ['agent-runs'] as const,
  agentRunsByConversation: (conversationId: string) =>
    ['agent-runs', { conversationId }] as const,
  agentRun: (id: string) => ['agent-run', id] as const,
  flows: ['flows'] as const,
  flow: (id: string) => ['flows', id] as const,
  flowVersions: (id: string) => ['flows', id, 'versions'] as const,
  flowVersionCompare: (id: string, from: number, to: number) =>
    ['flows', id, 'versions', 'compare', from, to] as const,
  flowRun: (id: string) => ['flow-run', id] as const,
  flowEndpoint: (id: string) => ['flow-endpoint', id] as const,
  voiceSettings: ['voice-settings'] as const,
  voiceModelStatus: ['voice-model-status'] as const,
};
