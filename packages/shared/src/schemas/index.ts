/**
 * @域 barrel Zod 契约（v1.1 M2 域子路径化）
 * 公开面与历史根 barrel 完全一致；根 barrel 聚合本面，新代码从 @wbfm/shared/schemas 导入。
 */
export * from './common';
export * from './report';
export * from './subagent';
export {
  providerProtocolSchema,
  providerCreateSchema,
  providerUpdateSchema,
  providerTestSchema,
  type ProviderCreateInput,
  type ProviderUpdateInput,
  type ProviderTestInput,
} from './provider';
export { modelCapabilitySchema, modelCreateSchema, type ModelCreateInput } from './model';
export {
  assistantCreateSchema,
  assistantUpdateSchema,
  assistantReorderSchema,
  type AssistantCreateInput,
  type AssistantUpdateInput,
  type AssistantReorderInput,
} from './assistant';
export {
  EXPRESSION_TAGS,
  DEFAULT_EXPRESSION,
  normalizeExpressionName,
  stripExpressionDirectives,
  type ExpressionTag,
} from './expression';
export {
  conversationCreateSchema,
  conversationUpdateSchema,
  chatRequestSchema,
  proactiveRequestSchema,
  type ConversationCreateInput,
  type ConversationUpdateInput,
  type ChatRequest,
  type ProactiveRequest,
} from './conversation';
export {
  knowledgeBaseCreateSchema,
  knowledgeBaseUpdateSchema,
  compileRequestSchema,
  clipRequestSchema,
  type KnowledgeBaseCreateInput,
  type KnowledgeBaseUpdateInput,
  type CompileRequest,
  type ClipRequest,
} from './knowledge';
export {
  settingsUpdateSchema,
  interactionGraphEntrySchema,
  INTERACTION_GRAPH_OVERRIDES_MAX,
  type InteractionGraphOverride,
  type SettingsUpdateInput,
} from './settings';

// v1.0 语音/形象契约
export {
  VOICE_ASR_ENGINES,
  VOICE_TTS_ENGINES,
  VOICE_TTS_MODELS,
  VOICE_INPUT_MODES,
  VAD_SENSITIVITIES,
  VOICE_STATES,
  voiceAsrEngineSchema,
  voiceTtsEngineSchema,
  voiceTtsModelSchema,
  voiceInputModeSchema,
  vadSensitivitySchema,
  voiceStateSchema,
  voiceSettingsUpdateSchema,
  voiceSettingsSchema,
  DEFAULT_VOICE_SETTINGS,
  voiceAsrRequestSchema,
  voiceAsrResponseSchema,
  voiceTtsRequestSchema,
  voiceModelStatusSchema,
  voiceModelDownloadSchema,
  voiceModelFileStatusSchema,
  type VoiceAsrEngine,
  type VoiceTtsEngine,
  type VoiceTtsModel,
  type VoiceInputMode,
  type VadSensitivity,
  type VoiceState,
  type VoiceSettingsUpdateInput,
  type VoiceSettings,
  type VoiceAsrRequest,
  type VoiceAsrResponse,
  type VoiceTtsRequest,
  type VoiceModelStatus,
  type VoiceModelDownload,
  type VoiceModelFileStatus,
  SUPPORTED_AVATAR_MODEL_IDS,
  DEFAULT_AVATAR_MODEL_ID,
  AVATAR_TTS_VOICES,
  getAvatarSpeakerId,
  type SupportedAvatarModelId,
  type AvatarTtsVoice,
} from './voice';
export {
  messageFeedbackSchema,
  type MessageFeedbackInput,
} from './message';
export {
  memoryCreateSchema,
  memoryUpdateSchema,
  memoryListQuerySchema,
  memoryClearSchema,
  type MemoryCreateInput,
  type MemoryUpdateInput,
  type MemoryListQuery,
  type MemoryClearInput,
} from './memory';
export {
  mcpServerCreateSchema,
  mcpServerUpdateSchema,
  buildMcpToolName,
  isMcpToolName,
  parseMcpToolName,
  MCP_TOOL_NAMESPACE,
  type McpServerCreateInput,
  type McpServerUpdateInput,
} from './mcp';
export {
  skillManifestSchema,
  skillUpdateSchema,
  type SkillUpdateInput,
} from './skill';
export {
  COMPUTER_CHANNEL_FILE,
  SCREENSHOT_MAX_EDGE,
  SCREEN_SNAPSHOT_SCOPES,
  screenSnapshotArgsSchema,
  screenSnapshotRegionSchema,
  computerChannelInfoSchema,
  type ScreenSnapshotScope,
  type ScreenSnapshotRegion,
  type ScreenSnapshotArgs,
  type ComputerChannelInfo,
  type ScreenSnapshotResponse,
  // v0.7 M2 键鼠 / 窗口 / UIA
  MOUSE_BUTTONS,
  KEY_NAMES,
  mouseMoveArgsSchema,
  mouseClickArgsSchema,
  mouseScrollArgsSchema,
  keyboardTypeArgsSchema,
  keyboardPressArgsSchema,
  windowFocusArgsSchema,
  appLaunchArgsSchema,
  uiaListArgsSchema,
  type MouseButton,
  type KeyName,
  type MouseMoveArgs,
  type MouseClickArgs,
  type MouseScrollArgs,
  type KeyboardTypeArgs,
  type KeyboardPressArgs,
  type MousePositionResponse,
  type WindowInfo,
  type WindowListResponse,
  type WindowFocusArgs,
  type AppLaunchArgs,
  type UiaElement,
  type UiaListArgs,
  type UiaListResponse,
  type InputActionResponse,
} from './computer';
export {
  AGENT_PERMISSION_MODES,
  AGENT_UNATTENDED_MODES,
  AGENT_WORKSPACE_PATH_MAX,
  DEFAULT_AGENT_PERMISSION_MODE,
  agentPermissionModeSchema,
  type AgentPermissionMode,
  type AgentUnattendedMode,
} from './agent-permission';
export {
  TASK_RUN_STATUSES,
  TASK_STOP_REASONS,
  TASK_STEP_KINDS,
  TASK_STEP_STATUSES,
  TASK_EVENT_TYPES,
  taskCreateSchema,
  type TaskRunStatus,
  type TaskStopReason,
  type TaskStepKind,
  type TaskStepStatus,
  type TaskCreateInput,
  type TaskRunView,
  type TaskStepView,
  type TaskEventType,
  type TaskEventPayload,
} from './task';

// v2.7 工作信号 / 审批中心
export {
  approvalDecisionSchema,
  type ApprovalDecisionInput,
} from './work-signal';

// v2.10 能力包
export {
  CAPABILITY_KINDS,
  CAPABILITY_PERMISSIONS,
  CAPABILITY_STATUSES,
  CAPABILITY_REQUIRED_PERMISSION,
  CAPABILITY_SUPPORTED_KINDS,
  CAPABILITY_ENTRY_BY_KIND,
  capabilityDependencySchema,
  capabilityManifestSchema,
  CAPABILITY_SIGNATURE_POLICIES,
  CAPABILITY_SIGNATURE_STATUSES,
  CAPABILITY_TRUSTED_KEYS_MAX,
  capabilityTrustedKeySchema,
  workflowCapabilityPayloadSchema,
  petActionCapabilityPayloadSchema,
  eventScriptCapabilityPayloadSchema,
  reportWidgetCapabilityPayloadSchema,
  REPORT_WIDGET_METRICS,
  type CapabilityKind,
  type CapabilityPermission,
  type CapabilityStatus,
  type CapabilityDependency,
  type CapabilityManifest,
  type CapabilityView,
  type CapabilitySignaturePolicy,
  type CapabilitySignatureStatus,
  type CapabilitySignatureViewStatus,
  type CapabilityTrustedKey,
  type WorkflowCapabilityPayload,
  type PetActionCapabilityPayload,
  type EventScriptCapabilityPayload,
  type ReportWidgetCapabilityPayload,
  type ReportWidgetMetric,
} from './capability';

// v2.13 通用 canonical JSON
export { canonicalJson } from './canonical-json';
// v2.13 Agent 治理策略 / 审批绑定
export {
  AGENT_POLICY_RULE_LENGTH,
  AGENT_POLICY_RULE_MAX,
  AGENT_POLICY_VERSION,
  DEFAULT_AGENT_POLICY,
  agentPolicySchema,
  resolveAgentPolicy,
  type AgentPolicy,
  type AgentPolicyDecision,
  type AgentPolicyEvaluationInput,
} from './agent-policy';
export {
  operationBindingSchema,
  type ApprovalBindingSummary,
  type OperationBinding,
} from './agent-binding';
// v2.13 执行审计账本
export {
  AUDIT_ACTORS,
  AUDIT_CHAIN_BROKEN,
  AUDIT_DECISIONS,
  AUDIT_EVENT_KINDS,
  AUDIT_GENESIS_HASH,
  AUDIT_UNAVAILABLE,
  auditActorSchema,
  auditDecisionSchema,
  auditEventKindSchema,
  auditEventViewSchema,
  auditQuerySchema,
  auditVerifyResultSchema,
  type AuditActor,
  type AuditDecision,
  type AuditEventKind,
  type AuditEventView,
  type AuditQuery,
  type AuditVerifyResult,
} from './audit';
// v2.12 能力包签名规范化（纯函数）
export {
  CAPABILITY_SIGNATURE_DOMAIN,
  canonicalizeCapabilityManifest,
  capabilitySignaturePayload,
} from './capability-signature';

// v2.12 能力包健康报告契约
export {
  CAPABILITY_HEALTH_ISSUE_CODES,
  type CapabilityHealth,
  type CapabilityHealthIssue,
  type CapabilityHealthIssueCode,
  type CapabilityHealthReport,
  type CapabilityHealthSeverity,
  type CapabilityHealthStatus,
  type CapabilityCleanupResult,
} from './capability-health';

// v2.8 目标 / 计划 / 待办
export {
  GOAL_STATUSES,
  WORK_PLAN_KINDS,
  WORK_PLAN_STATUSES,
  WORK_PLAN_ORIGINS,
  WORK_STEP_STATUSES,
  goalCreateSchema,
  goalUpdateSchema,
  workPlanCreateSchema,
  workPlanUpdateSchema,
  workPlanReviewSchema,
  workPlanStepUpdateSchema,
  isPlanReviewable,
  isPlanExecutable,
  type GoalStatus,
  type WorkPlanKind,
  type WorkPlanStatus,
  type WorkPlanOrigin,
  type WorkStepStatus,
  type ConversationGoalView,
  type WorkPlanStepView,
  type WorkPlanView,
  type GoalCreateInput,
  type GoalUpdateInput,
  type WorkPlanCreateInput,
  type WorkPlanUpdateInput,
  type WorkPlanReviewInput,
  type WorkPlanStepUpdateInput,
} from './work-plan';

// v0.8 Flow Studio 可视化工作流
export {
  FLOW_NODE_TYPES,
  CONDITION_BRANCHES,
  FLOW_INPUT_VALUE_TYPES,
  flowInputFieldSchema,
  flowStartConfigSchema,
  flowAgentConfigSchema,
  buildFlowInputJsonSchema,
  flowNodeSchema,
  flowEdgeSchema,
  flowGraphSchema,
  workflowCreateSchema,
  workflowUpdateSchema,
  workflowVersionCreateSchema,
  flowRunCreateSchema,
  flowHumanSubmitSchema,
  FLOW_TOOL_NAMESPACE,
  buildFlowToolName,
  isFlowToolName,
  parseFlowToolName,
  type FlowNodeType,
  type ConditionBranch,
  type FlowInputValueType,
  type FlowInputField,
  type FlowStartConfig,
  type FlowAgentConfig,
  type FlowNode,
  type FlowEdge,
  type FlowGraph,
  type WorkflowCreateInput,
  type WorkflowUpdateInput,
  type WorkflowVersionCreateInput,
  type FlowRunCreateInput,
  type FlowHumanSubmitInput,
} from './flow';
// v0.9 Flow Serving 契约（端点/无人值守策略）
export {
  FLOW_ENDPOINT_SYNC_TIMEOUT,
  FLOW_ENDPOINT_RATE_LIMIT,
  FLOW_DESKTOP_CONTROL_TOOLS,
  flowUnattendedPolicySchema,
  flowEndpointUpsertSchema,
  flowEndpointStatusSchema,
  type FlowEndpointUpsertInput,
} from './flow-serving';

// v1.4 多智能体协作契约
export {
  AGENT_ROLES,
  AGENT_PHASES,
  REVIEW_VERDICTS,
  AGENT_RUN_STATUSES,
  AGENT_LIMITS,
  AGENT_BUDGET_DEFAULTS,
  AGENT_BUDGET_BOUNDS,
  AGENT_HANDOFF_EDGES,
  agentBudgetSchema,
  subtaskSpecSchema,
  executorOutcomeSchema,
  reviewVerdictSchema,
  agentHandoffPayloadSchema,
  agentRunCreateSchema,
  agentHandoffEdge,
  isValidHandoffEdge,
  type AgentRole,
  type AgentPhase,
  type ReviewVerdict,
  type AgentRunStatus,
  type AgentBudget,
  type AgentBudgetUsage,
  type SubtaskSpec,
  type ExecutorOutcome,
  type ReviewVerdictPayload,
  type AgentHandoffPayload,
  type AgentHandoffEdge,
  type AgentRunCreateInput,
  type AgentRunView,
  type AgentHandoffView,
} from './agent';

// v0.6 M2：工具权限分级（HITL）调试/确认入参契约
export {
  toolConfirmSchema,
  toolDebugExecuteSchema,
  type ToolConfirmInput,
  type ToolDebugExecuteInput,
} from './tool';

// v1.6 情绪内核契约（域子 barrel，见 emotion-domain.ts）
export * from './emotion-domain';

// v1.7 剧情事件引擎契约
export * from './event';
// v1.7 角色化提醒（scheduled_tasks）
export * from './scheduled-task';
// v1.7 演出用量 HTTP 契约
export * from './event-usage';
// v1.7 M5 自定义短语触发器
export * from './event-trigger';

// v1.8 角色卡库契约（ExpressionTag 与 ./expression 重名，显式导出优先不冲突）
export * from './character-card';

// v1.9 舞台契约（cast/指令/场景）
export * from './stage';
export * from './meeting';

// v2.0 关系等级块（挂 emotion state v2）
export * from './relationship';
// v2.0 M4 VRM 形象契约
export * from './vrm-avatar';
// v2.0 交互触发管道契约
export * from './interaction-events';
export * from './interaction-actions';
export {
  resolveInteraction,
  relationshipLevelName,
  RELATIONSHIP_LEVEL_NAMES,
  touchTriggerKey,
  isDoNotDisturbHour,
  DEFAULT_DO_NOT_DISTURB,
  type DoNotDisturbConfig,
} from './interaction-resolvers';
export * from './interaction-hitbox';
// v2.3 交互动画图（数据配置层：条目条件 = 关系等级/情绪档位/时段；触发键覆盖全事件类型）
export * from './interaction-graph';
// v2.3 动画图动作条目目录（id → 动作链；与条目/匹配分离，各守 240 行）
export * from './interaction-chains';
export * from './relationship-level';
// v2.0 M5 .wbfm-pack mod 包契约
export * from './wbfm-pack';
// v2.0 待机动作（VRMA）契约
export * from './motion-asset';
// v2.2 M2 待机动作状态驱动挑选（策略层纯函数，两后端共用）
export * from './motion-selection';
