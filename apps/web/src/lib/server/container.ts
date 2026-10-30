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
  createVrmAvatarService,
  createMotionService,
  createModPackService,
  createPendingConfirmations,
  createPermissionService,
  createProviderService,
  createSettingsService,
  createTaskGrantRegistry,
  createTaskRunnerService,
  recoverInterruptedRunJobs,
  type ServiceDeps,
} from '@wbfm/core/services';
import { createChatOrchestrator } from '@wbfm/core/chat';
import { createCapabilityServiceForApp } from './capability-wiring';
import { createSubagentRunsForApp } from './subagent-wiring';
import { createMilestoneService } from '@wbfm/core/emotion';
import { createAgentRunService, createSubagentProviderRegistry } from '@wbfm/core/agents';
import { createMeetingClosureService, createMeetingService } from '@wbfm/core/meeting';
import { createMeetingDeps } from './meeting-provider';
import { createAgentClientsProvider, createAgentPlanContextResolver } from './agent-clients-provider';
import { createEndpointService, createRateLimiter } from '@wbfm/core/serving';
import { createFlowRunService, ensureStarterFlows } from '@wbfm/core/flow';
import { createIngestionPipeline } from '@wbfm/core/ingestion';
import { createCompileRunnerService, createKnowledgeGovernanceService, ensureStarterKnowledgeBases } from '@wbfm/core/knowledge';
import { createMcpRegistry } from '@wbfm/core/mcp';
import { createMemoryService } from '@wbfm/core/memory';
import { createSchedulesService } from '@wbfm/core/scheduler';
import {
  createEventUsageService,
  createEventTriggersService,
} from '@wbfm/core/event';
import { createSkillService } from '@wbfm/core/skills';
import { registerExitCleanup } from './container-exit';
import { createToolBreaker, createToolRuntime } from '@wbfm/core/tools';
import { createWebCipher, type SecretCipher } from '@wbfm/core/secrets';
import { createApprovalRegistry, createWorkSignalHub } from '@wbfm/core/work-signal';
import { createRunCompletionService, createWorkPlanService } from '@wbfm/core/work-plan';
import { createSessionExportService, createSessionLogService } from '@wbfm/core/session-log';
import { createCapabilityService } from '@wbfm/core/capabilities';
import { createAuditService } from '@wbfm/core/governance';

import type { ServiceContainer } from './container-types';
export type { ServiceContainer };

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
  // v2.8：进程启动即收敛上次残留的非终态运行，避免幽灵 running/queued
  const recovered = recoverInterruptedRunJobs(db);
  if (recovered.tasks > 0 || recovered.agents > 0) {
    console.info(
      `[recovery] 已收敛中断运行：任务 ${recovered.tasks} 个，协作 ${recovered.agents} 个`,
    );
  }
  const ownerId = `web-${process.pid}-${Date.now()}`;
  const mcp = createMcpRegistry(db);
  const permissions = createPermissionService({ db, cipher });
  const confirmations = createPendingConfirmations();
  const approvals = createApprovalRegistry();
  const skills = createSkillService({ db });
  const breakers = createToolBreaker();
  const taskGrants = createTaskGrantRegistry();
  const deps: ServiceDeps = {
    db,
    cipher,
    mcp,
    permissions,
    confirmations,
    approvals,
    skills,
    breakers,
    taskGrants,
  };
  const audit = createAuditService(db);
  deps.audit = audit;
  const settingsService = createSettingsService(deps);
  deps.agentPolicy = () => settingsService.get().agentPolicy!;
  const sessionLog = createSessionLogService(deps);
  deps.events = sessionLog;
  const sessionExport = createSessionExportService(deps, sessionLog);
  const subagentProviders = createSubagentProviderRegistry();
  const runtime = createToolRuntime(deps);
  const workSignals = createWorkSignalHub({ approvals });
  const workPlans = createWorkPlanService(deps, {
    onChange: (plan) => workSignals.ingestPlan(plan),
  });
  deps.workPlans = workPlans;
  const completions = createRunCompletionService(deps);
  const taskRunner = createTaskRunnerService(
    deps,
    runtime,
    (run, event) => {
      workSignals.ingestTask(run, event);
      const data = event.data as { type?: unknown };
      sessionLog.record({
        scope: 'task',
        scopeId: run.id,
        type: typeof data?.type === 'string' ? data.type : event.event,
        payload: event.data,
      });
    },
    { ownerId, onComplete: (run) => completions.completeTask(run) },
  );
  // v1.4：协作角色生产通道（三级模型回落 + executor task-loop 适配器）。
  // 必须在 flowRunner 前构造——agent 节点执行经 startFlowNode 发起协作。
  const assistants = createAssistantsService(deps);
  const knowledgeBases = createKnowledgeService(deps);
  const agentClientsFactory = { deps, runtime, assistants, knowledgeBases };
  const agentRuns = createAgentRunService({
    db,
    clientsProvider: createAgentClientsProvider(agentClientsFactory),
    resolvePlanContext: createAgentPlanContextResolver(agentClientsFactory),
    onEvent: (run, event) => {
      workSignals.ingestAgent(run, event);
      sessionLog.record({
        scope: 'agent',
        scopeId: run.id,
        type: event.event,
        payload: event.data,
      });
    },
    onComplete: (run) => completions.completeAgent(run),
    ownerId,
  });
  // v1.9 M3：多助手会议（新表新调度，共用模型/角色卡人格；与协作分账）
  const meetings = createMeetingService(createMeetingDeps(deps, assistants));
  // v0.8：flow 运行服务（内部复用 runtime；回填 resolver 打破构造环，
  // resolveTool 仅在实际遇到 flow:<id> 时懒调用）
  const workflows = createWorkflowRepository(db);
  // v2.11：能力包 effect 需要动作服务；同一实例供容器返回
  const motionsService = createMotionService(db);
  const capabilities = createCapabilityServiceForApp({
    deps,
    skills,
    mcp,
    workflows,
    motions: motionsService,
  });
  // v0.9：端点仓储同时供 flowRunner（策略快照）与端点服务（管理/鉴权）使用，必须同一实例
  const endpointRepo = createWorkflowEndpointRepository(db);
  const flowRunner = createFlowRunService({
    deps,
    runtime,
    workflows,
    runs: createWorkflowRunRepository(db),
    endpoints: endpointRepo,
    agentRuns,
    onEvent: (run, event, title) => {
      workSignals.ingestFlow(run, event, title);
      sessionLog.record({
        scope: 'flow',
        scopeId: run.id,
        type: event.type,
        payload: event,
      });
    },
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
    approvals,
    workSignals,
    workPlans,
    completions,
    sessionLog,
    sessionExport,
    capabilities,
    subagentProviders,
    subagentRuns: createSubagentRunsForApp({ deps, providers: subagentProviders, approvals, workSignals, sessionLog, completions }),
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
    settings: settingsService,
    audit,
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
    motions: motionsService,
    workflows,
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
