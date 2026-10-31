import type { DatabaseInstance, createWorkflowRepository } from '@wbfm/database';
import type { SecretCipher } from '@wbfm/core/secrets';
import type {
  createAssistantsService,
  createAttachmentService,
  createCharacterCardService,
  createConversationService,
  createDocumentService,
  createKnowledgeService,
  createModelService,
  createModPackService,
  createMotionService,
  createPendingConfirmations,
  createPermissionService,
  createProviderService,
  createSettingsService,
  createStageSceneService,
  createTaskGrantRegistry,
  createTaskRunnerService,
  createVrmAvatarService,
} from '@wbfm/core/services';
import type { createChatOrchestrator } from '@wbfm/core/chat';
import type { createMilestoneService } from '@wbfm/core/emotion';
import type { createAgentRunService } from '@wbfm/core/agents';
import type { createMeetingClosureService, createMeetingService } from '@wbfm/core/meeting';
import type { createEndpointService, createRateLimiter } from '@wbfm/core/serving';
import type { createFlowRunService } from '@wbfm/core/flow';
import type { createIngestionPipeline } from '@wbfm/core/ingestion';
import type {
  createCompileRunnerService,
  createKnowledgeGovernanceService,
} from '@wbfm/core/knowledge';
import type { createMcpRegistry } from '@wbfm/core/mcp';
import type { createMemoryService } from '@wbfm/core/memory';
import type { createSchedulesService } from '@wbfm/core/scheduler';
import type { createEventTriggersService, createEventUsageService } from '@wbfm/core/event';
import type { createToolBreaker, createToolRuntime } from '@wbfm/core/tools';
import type { createSkillService } from '@wbfm/core/skills';
import type { createApprovalRegistry, createWorkSignalHub } from '@wbfm/core/work-signal';
import type { createRunCompletionService, createWorkPlanService } from '@wbfm/core/work-plan';
import type {
  createSessionExportService,
  createSessionLogService,
} from '@wbfm/core/session-log';
import type { createCapabilityService } from '@wbfm/core/capabilities';
import type { createSubagentProviderRegistry, createSubagentRunService } from '@wbfm/core/agents';
import type { createAuditService } from '@wbfm/core/governance';

/**
 * v2.7：服务容器契约外迁（拆分守行数门禁）。
 * 字段全部由工厂 ReturnType 推导，避免两处手写类型漂移。
 */
export interface ServiceContainer {
  db: DatabaseInstance;
  cipher: SecretCipher;
  providers: ReturnType<typeof createProviderService>;
  models: ReturnType<typeof createModelService>;
  settings: ReturnType<typeof createSettingsService>;
  audit: ReturnType<typeof createAuditService>;
  assistants: ReturnType<typeof createAssistantsService>;
  characterCards: ReturnType<typeof createCharacterCardService>;
  stageScenes: ReturnType<typeof createStageSceneService>;
  conversations: ReturnType<typeof createConversationService>;
  orchestrator: ReturnType<typeof createChatOrchestrator>;
  ingestion: ReturnType<typeof createIngestionPipeline>;
  knowledgeBases: ReturnType<typeof createKnowledgeService>;
  knowledgeGovernance: ReturnType<typeof createKnowledgeGovernanceService>;
  knowledgeCompile: ReturnType<typeof createCompileRunnerService>;
  documents: ReturnType<typeof createDocumentService>;
  attachments: ReturnType<typeof createAttachmentService>;
  memories: ReturnType<typeof createMemoryService>;
  schedules: ReturnType<typeof createSchedulesService>;
  eventUsage: ReturnType<typeof createEventUsageService>;
  eventTriggers: ReturnType<typeof createEventTriggersService>;
  mcp: ReturnType<typeof createMcpRegistry>;
  permissions: ReturnType<typeof createPermissionService>;
  confirmations: ReturnType<typeof createPendingConfirmations>;
  approvals: ReturnType<typeof createApprovalRegistry>;
  workSignals: ReturnType<typeof createWorkSignalHub>;
  workPlans: ReturnType<typeof createWorkPlanService>;
  completions: ReturnType<typeof createRunCompletionService>;
  sessionLog: ReturnType<typeof createSessionLogService>;
  sessionExport: ReturnType<typeof createSessionExportService>;
  capabilities: ReturnType<typeof createCapabilityService>;
  subagentProviders: ReturnType<typeof createSubagentProviderRegistry>;
  subagentRuns: ReturnType<typeof createSubagentRunService>;
  skills: ReturnType<typeof createSkillService>;
  breakers: ReturnType<typeof createToolBreaker>;
  taskGrants: ReturnType<typeof createTaskGrantRegistry>;
  taskRunner: ReturnType<typeof createTaskRunnerService>;
  agentRuns: ReturnType<typeof createAgentRunService>;
  relationshipMilestones: ReturnType<typeof createMilestoneService>;
  meetings: ReturnType<typeof createMeetingService>;
  meetingClosure: ReturnType<typeof createMeetingClosureService>;
  runtime: ReturnType<typeof createToolRuntime>;
  flowRunner: ReturnType<typeof createFlowRunService>;
  endpoints: ReturnType<typeof createEndpointService>;
  rateLimiter: ReturnType<typeof createRateLimiter>;
  vrmAvatars: ReturnType<typeof createVrmAvatarService>;
  motions: ReturnType<typeof createMotionService>;
  workflows: ReturnType<typeof createWorkflowRepository>;
  modPacks: ReturnType<typeof createModPackService>;
}
