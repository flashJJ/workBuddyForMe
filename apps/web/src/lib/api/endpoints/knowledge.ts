/** 知识库/文档/附件/产物/存储/记忆相关路径（v4.13 从 endpoints.ts 拆出） */
export const knowledgeApi = {
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
  memoryExplain: '/api/memories/explain',
  /** v2.31：手动触发记忆空闲整理 */
  memoryConsolidate: '/api/memories/consolidate',
} as const;
