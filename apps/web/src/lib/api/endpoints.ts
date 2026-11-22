import { chatApi } from './endpoints/chat';
import { knowledgeApi } from './endpoints/knowledge';
import { systemApi } from './endpoints/system';
import { workApi } from './endpoints/work';

/** API 路径集中常量，避免页面散落魔法字符串（v4.13 按域拆分，此处保持 barrel 兼容） */
export const API = {
  ...chatApi,
  ...knowledgeApi,
  ...systemApi,
  ...workApi,
} as const;

export const QUERY_KEYS = {
  providers: ['providers'] as const,
  providerHealth: (days: number) => ['provider-health', days] as const,
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
  modPackInstalls: ['mod-pack-installs'] as const,
  documents: (kbId: string) => ['documents', kbId] as const,
  documentStructure: (documentId: string) => ['document-structure', documentId] as const,
  kbGovernance: (kbId: string) => ['kb-governance', kbId] as const,
  kbCompileStatus: (kbId: string) => ['kb-compile-status', kbId] as const,
  kbReparseBatch: (kbId: string) => ['kb-reparse-batch', kbId] as const,
  attachment: (id: string) => ['attachment', id] as const,
  memories: ['memories'] as const,
  memoryStats: ['memories', 'stats'] as const,
  memoryExplain: ['memories', 'explain'] as const,
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
