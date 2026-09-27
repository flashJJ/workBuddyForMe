import {
  initDatabase,
  type DatabaseInstance,
} from '@wbfm/database';
import {
  createAssistantsService,
  createAttachmentService,
  createChatOrchestrator,
  createConversationService,
  createDocumentService,
  createIngestionPipeline,
  createKnowledgeService,
  createMcpRegistry,
  createMemoryService,
  createModelService,
  createProviderService,
  createSettingsService,
  createWebCipher,
  type AssistantsService,
  type AttachmentService,
  type ChatOrchestrator,
  type ConversationService,
  type DocumentService,
  type IngestionPipeline,
  type KnowledgeService,
  type McpRegistry,
  type MemoryService,
  type SecretCipher,
} from '@wbfm/core';

export interface ServiceContainer {
  db: DatabaseInstance;
  cipher: SecretCipher;
  providers: ReturnType<typeof createProviderService>;
  models: ReturnType<typeof createModelService>;
  settings: ReturnType<typeof createSettingsService>;
  assistants: AssistantsService;
  conversations: ConversationService;
  orchestrator: ChatOrchestrator;
  ingestion: IngestionPipeline;
  knowledgeBases: KnowledgeService;
  documents: DocumentService;
  attachments: AttachmentService;
  memories: MemoryService;
  /** v0.6：MCP 注册表（设置页与工具运行时共享同一连接池） */
  mcp: McpRegistry;
}

let container: ServiceContainer | null = null;

function resolveCipher(): SecretCipher {
  // Electron 可在启动前通过全局注入 safeStorage 桥接密码器（见 Task 30）
  const bridge = (globalThis as { __WBFM_CIPHER__?: SecretCipher }).__WBFM_CIPHER__;
  if (bridge) return bridge;
  return createWebCipher();
}

function build(db: DatabaseInstance, cipher: SecretCipher): ServiceContainer {
  const mcp = createMcpRegistry(db);
  const deps = { db, cipher, mcp };
  return {
    db,
    cipher,
    mcp,
    providers: createProviderService(deps),
    models: createModelService(deps),
    settings: createSettingsService(deps),
    assistants: createAssistantsService(deps),
    conversations: createConversationService(deps),
    orchestrator: createChatOrchestrator(deps),
    ingestion: createIngestionPipeline(deps),
    knowledgeBases: createKnowledgeService(deps),
    documents: createDocumentService(deps),
    attachments: createAttachmentService(deps),
    memories: createMemoryService(deps),
  };
}

/**
 * 进程退出清理：断开全部 MCP 子进程（幂等 best-effort）。
 * 断开链路在首个 await 前同步发出 kill 信号，signal 处理器内随后 exit 也不会遗漏。
 * 标志挂 globalThis：dev server 模块重载会重置模块级变量，重复注册会触发
 * MaxListenersExceededWarning。
 */
function registerExitCleanup(registry: McpRegistry): void {
  const holder = globalThis as { __WBFM_MCP_EXIT_CLEANUP__?: boolean };
  if (holder.__WBFM_MCP_EXIT_CLEANUP__) return;
  holder.__WBFM_MCP_EXIT_CLEANUP__ = true;
  const disconnectAll = () => {
    void registry.disconnectAll().catch(() => undefined);
  };
  process.once('exit', disconnectAll);
  // 注册处理器会接管默认信号行为，故 cleanup 后显式退出
  process.once('SIGTERM', () => {
    disconnectAll();
    process.exit(0);
  });
  process.once('SIGINT', () => {
    disconnectAll();
    process.exit(0);
  });
}

/** 获取服务单例：首次访问时初始化文件数据库与全部业务服务 */
export function getServices(): ServiceContainer {
  if (container) return container;
  container = build(initDatabase(), resolveCipher());
  registerExitCleanup(container.mcp);
  // 按仓储现状对齐 MCP 连接（异步，不阻塞首请求）
  container.mcp.reconcile();
  return container;
}

/** 仅供测试：替换/清空容器 */
export function __setContainerForTest(value: ServiceContainer | null): void {
  container = value;
}

/** 仅供测试：基于内存/临时库快速装配 */
export function __buildContainerForTest(db: DatabaseInstance, cipher: SecretCipher) {
  container = build(db, cipher);
  return container;
}
