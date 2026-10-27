import {
  initDatabase,
  createEventUsageRepository,
  createKnowledgeRepository,
  createWorkflowRepository,
  createWorkflowEndpointRepository,
  createWorkflowRunRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import {
  createAssistantsService,
  createAttachmentService,
  createCharacterCardService,
  createStageSceneService,
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
  type CharacterCardService,
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
import { createMilestoneService, type MilestoneService } from '@wbfm/core/emotion';
import { createAgentRunService, type AgentRunService } from '@wbfm/core/agents';
import { createMeetingClosureService, createMeetingService, type MeetingClosureService, type MeetingService } from '@wbfm/core/meeting';
import { createMeetingDeps } from './meeting-provider';
import { createAgentClientsProvider, createAgentPlanContextResolver } from './agent-clients-provider';
import {
  createEndpointService,
  createRateLimiter,
  type EndpointService,
  type RateLimiter,
} from '@wbfm/core/serving';
import { createFlowRunService, ensureStarterFlows, type FlowRunService } from '@wbfm/core/flow';
import { createIngestionPipeline, type IngestionPipeline } from '@wbfm/core/ingestion';
import {
  createCompileRunnerService,
  createKnowledgeGovernanceService,
  ensureStarterKnowledgeBases,
  type CompileRunnerService,
  type KnowledgeGovernanceService,
} from '@wbfm/core/knowledge';
import { createMcpRegistry, type McpRegistry } from '@wbfm/core/mcp';
import { createMemoryService, type MemoryService } from '@wbfm/core/memory';
import { createSchedulesService, type SchedulesService } from '@wbfm/core/scheduler';
import { createEventUsageService, type EventUsageService, createEventTriggersService, type EventTriggersService } from '@wbfm/core/event';
import {
  createVrmAvatarService,
  type VrmAvatarService,
  createMotionService,
  type MotionService,
  createModPackService,
  type ModPackService,
} from '@wbfm/core/services';
import { createSkillService, type SkillService } from '@wbfm/core/skills';
import { registerExitCleanup } from './container-exit';
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
  /** v1.8：角色卡库（内置只读卡 + 自建卡 CRUD/导入导出/助手选卡） */
  characterCards: CharacterCardService;
  /** v1.9：舞台场景 CRUD + 自定义背景落盘 */
  stageScenes: ReturnType<typeof createStageSceneService>;
  conversations: ConversationService;
  orchestrator: ChatOrchestrator;
  ingestion: IngestionPipeline;
  knowledgeBases: KnowledgeService;
  /** v1.3：知识治理只读服务（冲突待裁决 + 疑似重复文档建议） */
  knowledgeGovernance: KnowledgeGovernanceService;
  /** v1.3：知识编译触发（M3 即时顺序编译；M4 替换为队列） */
  knowledgeCompile: CompileRunnerService;
  documents: DocumentService;
  attachments: AttachmentService;
  memories: MemoryService;
  /** v1.7：角色化提醒调度与演出用量 */
  schedules: SchedulesService;
  eventUsage: EventUsageService;
  /** v1.7 M5：自定义短语触发器 */
  eventTriggers: EventTriggersService;
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
  /** v1.4 多智能体协作 */
  agentRuns: AgentRunService;
  /** v2.0 M2：共同里程碑达成评估与查询 */
  relationshipMilestones: MilestoneService;
  /** v1.9 M3 多助手会议 */
  meetings: MeetingService;
  meetingClosure: MeetingClosureService;
  /** v0.6 M4：工具运行时（调试台路由用 listDebugTools + debugExecuteTool） */
  runtime: ToolRuntime;
  /** v0.8 M1：工作流运行服务（试运行/落库；已发布流程经 runtime 第三来源解析） */
  flowRunner: FlowRunService;
  /** v0.9：对外端点服务（密钥/开关/策略配置 + 公开调用鉴权） */
  endpoints: EndpointService;
  /** v0.9：公开 API 每端点速率限制器（进程内单例） */
  rateLimiter: RateLimiter;
  /** v2.0 M4：VRM 形象导入/存储/删除 */
  vrmAvatars: VrmAvatarService;
  /** v2.0：待机动作（VRMA）导入/存储/删除 */
  motions: MotionService;
  /** v2.0 M5：.wbfm-pack 打包/预检/导入 */
  modPacks: ModPackService;
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
  // v1.4：协作角色生产通道（三级模型回落 + executor task-loop 适配器）。
  // 必须在 flowRunner 前构造——agent 节点执行经 startFlowNode 发起协作。
  const assistants = createAssistantsService(deps);
  const knowledgeBases = createKnowledgeService(deps);
  const agentClientsFactory = { deps, runtime, assistants, knowledgeBases };
  const agentRuns = createAgentRunService({
    db,
    clientsProvider: createAgentClientsProvider(agentClientsFactory),
    resolvePlanContext: createAgentPlanContextResolver(agentClientsFactory),
  });
  // v1.9 M3：多助手会议（新表新调度，共用模型/角色卡人格；与协作分账）
  const meetings = createMeetingService(createMeetingDeps(deps, assistants));
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
    agentRuns,
  });
  // v0.8 M3：启动播种 3 个内置 starter flows（幂等，播种即发布）
  const starterCount = ensureStarterFlows(workflows);
  if (starterCount > 0) console.info(`[flow] 已播种 ${starterCount} 个内置工作流模板`);
  // v2.3：启动播种内置知识库模板（幂等，固定 id，只增不改）
  const kbStarterCount = ensureStarterKnowledgeBases(createKnowledgeRepository(db));
  if (kbStarterCount > 0) console.info(`[knowledge] 已播种 ${kbStarterCount} 个内置知识库模板`);
  // v1.7：清理 90 天前的事件演出流水（小表，不无限增长；失败不阻断启动）
  try {
    const purged = createEventUsageRepository(deps.db).purgeBefore(
      Date.now() - 90 * 24 * 3600_000,
    );
    if (purged > 0) console.info(`[event] 已清理 ${purged} 条过期演出流水`);
  } catch (error) {
    console.warn('[event] 演出流水清理失败', error);
  }
  deps.flowToolResolver = (workflowId) => flowRunner.resolveAsTool(workflowId);
  deps.flowToolLister = () => flowRunner.listPublishedTools();
  const endpoints = createEndpointService({ endpoints: endpointRepo, workflows });
  const rateLimiter = createRateLimiter();
  const stageScenes = createStageSceneService(deps);
  const modPacks = createModPackService({ db, stageScenes });
  const schedules = createSchedulesService(deps);
  const meetingClosure = createMeetingClosureService({ db, workflows, flowRunner, schedules });
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
    agentRuns,
    relationshipMilestones: createMilestoneService(deps),
    meetings,
    meetingClosure,
    runtime,
    flowRunner,
    providers: createProviderService(deps),
    models: createModelService(deps),
    settings: createSettingsService(deps),
    assistants,
    characterCards: createCharacterCardService(deps),
    stageScenes,
    conversations: createConversationService(deps),
    orchestrator: createChatOrchestrator(deps),
    ingestion: createIngestionPipeline(deps),
    knowledgeBases,
    knowledgeGovernance: createKnowledgeGovernanceService(deps),
    knowledgeCompile: createCompileRunnerService(deps),
    documents: createDocumentService(deps),
    attachments: createAttachmentService(deps),
    memories: createMemoryService(deps),
    schedules,
    eventUsage: createEventUsageService(deps),
    eventTriggers: createEventTriggersService(deps),
    vrmAvatars: createVrmAvatarService(db),
    motions: createMotionService(db),
    modPacks,
  };
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
