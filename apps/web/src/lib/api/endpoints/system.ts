/** 模型/设置/助手/角色卡/舞台/能力包/MCP/技能/工具/语音相关路径（v4.13 从 endpoints.ts 拆出） */
export const systemApi = {
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
  // v2.15 凭证轮换
  secretRotate: '/api/secrets/rotate',
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
  // v1.0 语音
  voiceSettings: '/api/voice/settings',
  voiceTts: '/api/voice/tts',
  voiceAsr: '/api/voice/asr',
  /** v2.25：PTT 识别结果润色（无模型/超时回退原文） */
  voicePolish: '/api/voice/polish',
  voiceModelStatus: '/api/voice/models/status',
  voiceModelDownload: '/api/voice/models/download',
} as const;
