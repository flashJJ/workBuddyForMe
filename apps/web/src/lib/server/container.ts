import {
  initDatabase,
  createWorkflowRepository,
  createWorkflowEndpointRepository,
  createWorkflowRunRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import {
  createAssistantsService,
  createAttachmentService,
  createConversationService,
  createDocumentService,
  createKnowledgeService,
  createModelService,
  createPendingConfirmations,
  createPermissionService,
  createProviderService,
  createSettingsService,
  createTaskGrantRegistry,
  createTaskRunnerService,
  type AssistantsService,
  type AttachmentService,
  type ConversationService,
  type DocumentService,
  type KnowledgeService,
  type PendingConfirmations,
  type PermissionService,
  type ServiceDeps,
  type TaskGrantRegistry,
  type TaskRunnerService,
} from '@wbfm/core/services';
import { createChatOrchestrator, type ChatOrchestrator } from '@wbfm/core/chat';
import {
  createEndpointService,
  createRateLimiter,
  type EndpointService,
  type RateLimiter,
} from '@wbfm/core/serving';
import { createFlowRunService, ensureStarterFlows, type FlowRunService } from '@wbfm/core/flow';
import { createIngestionPipeline, type IngestionPipeline } from '@wbfm/core/ingestion';
import { createMcpRegistry, type McpRegistry } from '@wbfm/core/mcp';
import { createMemoryService, type MemoryService } from '@wbfm/core/memory';
import { createSkillService, type SkillService } from '@wbfm/core/skills';
import {
  createToolBreaker,
  createToolRuntime,
  type ToolBreaker,
  type ToolRuntime,
} from '@wbfm/core/tools';
import { createWebCipher, type SecretCipher } from '@wbfm/core/secrets';

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
  /** v0.6 M2：工具权限服务（HITL 授权记忆） */
  permissions: PermissionService;
  /** v0.6 M2：HITL 挂起确认注册表（orchestrator 挂起点 ↔ /api/tools/confirm） */
  confirmations: PendingConfirmations;
  /** v0.6 M3：技能包服务（启动时 reconcile 扫盘对齐） */
  skills: SkillService;
  /** v0.6 M4：工具熔断器（连续失败降级；面板路由共享同一实例） */
  breakers: ToolBreaker;
  /** v0.7 M2：任务级批量授权（remember='task'，仅内存） */
  taskGrants: TaskGrantRegistry;
  /** v0.7 M3：任务运行管理服务（包装 runTaskLoop 为可外部控制） */
  taskRunner: TaskRunnerService;
  /** v0.6 M4：工具运行时（调试台路由用 listDebugTools + debugExecuteTool） */
  runtime: ToolRuntime;
  /** v0.8 M1：工作流运行服务（试运行/落库；已发布流程经 runtime 第三来源解析） */
  flowRunner: FlowRunService;
  /** v0.9：对外端点服务（密钥/开关/策略配置 + 公开调用鉴权） */
  endpoints: EndpointService;
  /** v0.9：公开 API 每端点速率限制器（进程内单例） */
  rateLimiter: RateLimiter;
}

let container: ServiceContainer | null = null;

/**
 * dev 模式下 Next 按需编译/HMR 会重新求值本模块，模块级 container 会重置为 null，
 * 导致 SSE 长连接持有旧 flowRunner（含人工等待器）而 POST 路由拿到新实例。
 * 额外在 globalThis 上保留同一单例，使模块重载后仍复用原容器（生产模式无影响）。
 */
const globalHolder = globalThis as { __WBFM_SERVICE_CONTAINER__?: ServiceContainer };

function readContainer(): ServiceContainer | null {
  return container ?? globalHolder.__WBFM_SERVICE_CONTAINER__ ?? null;
}

function writeContainer(value: ServiceContainer | null): void {
  container = value;
  if (value) globalHolder.__WBFM_SERVICE_CONTAINER__ = value;
  else delete globalHolder.__WBFM_SERVICE_CONTAINER__;
}

function resolveCipher(): SecretCipher {
  // Electron 可在启动前通过全局注入 safeStorage 桥接密码器（见 Task 30）
  const bridge = (globalThis as { __WBFM_CIPHER__?: SecretCipher }).__WBFM_CIPHER__;
  if (bridge) return bridge;
  return createWebCipher();
}

function build(db: DatabaseInstance, cipher: SecretCipher): ServiceContainer {
  const mcp = createMcpRegistry(db);
  const permissions = createPermissionService({ db, cipher });
  const confirmations = createPendingConfirmations();
  const skills = createSkillService({ db });
  const breakers = createToolBreaker();
  const taskGrants = createTaskGrantRegistry();
  const deps: ServiceDeps = {
    db,
    cipher,
    mcp,
    permissions,
    confirmations,
    skills,
    breakers,
    taskGrants,
  };
  const runtime = createToolRuntime(deps);
  const taskRunner = createTaskRunnerService(deps, runtime);
  // v0.8：flow 运行服务（内部复用 runtime；回填 resolver 打破构造环，
  // resolveTool 仅在实际遇到 flow:<id> 时懒调用）
  const workflows = createWorkflowRepository(db);
  // v0.9：端点仓储同时供 flowRunner（策略快照）与端点服务（管理/鉴权）使用，必须同一实例
  const endpointRepo = createWorkflowEndpointRepository(db);
  const flowRunner = createFlowRunService({
    deps,
    runtime,
    workflows,
    runs: createWorkflowRunRepository(db),
    endpoints: endpointRepo,
  });
  // v0.8 M3：启动播种 3 个内置 starter flows（幂等，播种即发布）
  const starterCount = ensureStarterFlows(workflows);
  if (starterCount > 0) console.info(`[flow] 已播种 ${starterCount} 个内置工作流模板`);
  deps.flowToolResolver = (workflowId) => flowRunner.resolveAsTool(workflowId);
  deps.flowToolLister = () => flowRunner.listPublishedTools();
  // v0.9：对外端点服务 + 公开 API 限流器
  const endpoints = createEndpointService({
    endpoints: endpointRepo,
    workflows,
  });
  const rateLimiter = createRateLimiter();
  return {
    endpoints,
    rateLimiter,
    db,
    cipher,
    mcp,
    permissions,
    confirmations,
    skills,
    breakers,
    taskGrants,
    taskRunner,
    runtime,
    flowRunner,
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
  const existing = readContainer();
  if (existing) return existing;
  const created = build(initDatabase(), resolveCipher());
  writeContainer(created);
  registerExitCleanup(created.mcp);
  // 按仓储现状对齐 MCP 连接（异步，不阻塞首请求）
  created.mcp.reconcile();
  // 技能包启动对齐：播种内置示例 + 扫盘登记（本地文件扫描，同步快速完成）
  created.skills.reconcile();
  return created;
}

/** 仅供测试：替换/清空容器 */
export function __setContainerForTest(value: ServiceContainer | null): void {
  writeContainer(value);
}

/** 仅供测试：基于内存/临时库快速装配 */
export function __buildContainerForTest(db: DatabaseInstance, cipher: SecretCipher) {
  const created = build(db, cipher);
  writeContainer(created);
  return created;
}
