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
}

let container: ServiceContainer | null = null;

function resolveCipher(): SecretCipher {
  // Electron 可在启动前通过全局注入 safeStorage 桥接密码器（见 Task 30）
  const bridge = (globalThis as { __WBFM_CIPHER__?: SecretCipher }).__WBFM_CIPHER__;
  if (bridge) return bridge;
  return createWebCipher();
}

function build(db: DatabaseInstance, cipher: SecretCipher): ServiceContainer {
  const deps = { db, cipher };
  return {
    db,
    cipher,
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
  };
}

/** 获取服务单例：首次访问时初始化文件数据库与全部业务服务 */
export function getServices(): ServiceContainer {
  if (container) return container;
  container = build(initDatabase(), resolveCipher());
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
