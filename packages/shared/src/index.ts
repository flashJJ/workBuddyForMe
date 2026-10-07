// 错误模型
export { ERROR_CODES, httpStatusFor, type ErrorCode } from './errors/error-codes';
export { ApiError, type ApiErrorBody } from './errors/api-error';

// 常量与领域类型
export * from './constants';
export { MEMORY_KINDS, MEMORY_STATUSES } from './types/domain';
export type {
  Provider,
  ProviderModel,
  DiscoveredModel,
  Assistant,
  Conversation,
  Message,
  Citation,
  Memory,
  MemoryKind,
  MemoryStatus,
  KnowledgeBase,
  DocumentRecord,
  Attachment,
  AppSettings,
  McpServerConfig,
  McpServerInfo,
  McpToolInfo,
  SkillPromptTemplate,
  SkillExample,
  SkillManifest,
  SkillDiskEntry,
  SkillState,
  SkillInfo,
  Timestamped,
} from './types/domain';
export type { ContentPart, TextContentPart, ImageContentPart } from './types/content-part';
export type {
  ToolTraceEntry,
  ToolEventPayload,
  ToolCallStatus,
  ToolSubstep,
  ToolSubstepStatus,
} from './types/tool';

// Zod 契约
export * from './schemas/common';
export {
  providerProtocolSchema,
  providerCreateSchema,
  providerUpdateSchema,
  providerTestSchema,
  type ProviderCreateInput,
  type ProviderUpdateInput,
  type ProviderTestInput,
} from './schemas/provider';
export { modelCapabilitySchema, modelCreateSchema, type ModelCreateInput } from './schemas/model';
export {
  assistantCreateSchema,
  assistantUpdateSchema,
  assistantReorderSchema,
  type AssistantCreateInput,
  type AssistantUpdateInput,
  type AssistantReorderInput,
} from './schemas/assistant';
export {
  EXPRESSION_TAGS,
  DEFAULT_EXPRESSION,
  normalizeExpressionName,
  stripExpressionDirectives,
  type ExpressionTag,
} from './schemas/expression';
export {
  conversationCreateSchema,
  conversationUpdateSchema,
  chatRequestSchema,
  proactiveRequestSchema,
  type ConversationCreateInput,
  type ConversationUpdateInput,
  type ChatRequest,
  type ProactiveRequest,
} from './schemas/conversation';
export {
  knowledgeBaseCreateSchema,
  knowledgeBaseUpdateSchema,
  clipRequestSchema,
  type KnowledgeBaseCreateInput,
  type KnowledgeBaseUpdateInput,
  type ClipRequest,
} from './schemas/knowledge';
export { settingsUpdateSchema, type SettingsUpdateInput } from './schemas/settings';

// v1.0 语音/形象/桌宠契约
export {
  VOICE_ASR_ENGINES,
  VOICE_TTS_ENGINES,
  VOICE_INPUT_MODES,
  VAD_SENSITIVITIES,
  VOICE_STATES,
  voiceAsrEngineSchema,
  voiceTtsEngineSchema,
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
} from './schemas/voice';
export {
  messageFeedbackSchema,
  type MessageFeedbackInput,
} from './schemas/message';
export {
  memoryCreateSchema,
  memoryUpdateSchema,
  memoryListQuerySchema,
  memoryClearSchema,
  type MemoryCreateInput,
  type MemoryUpdateInput,
  type MemoryListQuery,
  type MemoryClearInput,
} from './schemas/memory';
export {
  mcpServerCreateSchema,
  mcpServerUpdateSchema,
  buildMcpToolName,
  isMcpToolName,
  parseMcpToolName,
  MCP_TOOL_NAMESPACE,
  type McpServerCreateInput,
  type McpServerUpdateInput,
} from './schemas/mcp';
export {
  skillManifestSchema,
  skillUpdateSchema,
  type SkillUpdateInput,
} from './schemas/skill';
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
} from './schemas/computer';
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
} from './schemas/task';

// v0.8 Flow Studio 可视化工作流
export {
  FLOW_NODE_TYPES,
  CONDITION_BRANCHES,
  FLOW_INPUT_VALUE_TYPES,
  flowInputFieldSchema,
  flowStartConfigSchema,
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
  type FlowNode,
  type FlowEdge,
  type FlowGraph,
  type WorkflowCreateInput,
  type WorkflowUpdateInput,
  type WorkflowVersionCreateInput,
  type FlowRunCreateInput,
  type FlowHumanSubmitInput,
} from './schemas/flow';
// v0.9 Flow Serving 契约（端点/无人值守策略）
export {
  FLOW_ENDPOINT_SYNC_TIMEOUT,
  FLOW_ENDPOINT_RATE_LIMIT,
  FLOW_DESKTOP_CONTROL_TOOLS,
  flowUnattendedPolicySchema,
  flowEndpointUpsertSchema,
  flowEndpointStatusSchema,
  type FlowEndpointUpsertInput,
} from './schemas/flow-serving';
export {
  FLOW_STATUSES,
  FLOW_RUN_STATUSES,
  FLOW_RUN_TERMINAL_STATUSES,
  FLOW_RUN_RESUMABLE_STATUSES,
  FLOW_NODE_EXEC_STATUSES,
  FLOW_TRIGGERS,
  FLOW_DIAGNOSTIC_SEVERITIES,
  FLOW_EVENT_TYPES,
  FLOW_ENDPOINT_STATUSES,
  FLOW_UNATTENDED_POLICY_MODES,
  type FlowStatus,
  type FlowRunStatus,
  type FlowNodeExecStatus,
  type FlowTrigger,
  type WorkflowView,
  type WorkflowVersionView,
  type WorkflowRunView,
  type NodeExecutionView,
  type FlowDiagnosticSeverity,
  type FlowDiagnostic,
  type FlowEventType,
  type FlowEventPayload,
  type FlowEndpointStatus,
  type FlowUnattendedPolicyMode,
  type FlowUnattendedPolicy,
  type WorkflowEndpointView,
  type WorkflowEndpointSecretView,
} from './types/flow';

// v0.6 M2：工具权限分级（HITL）
export type { PermissionLevel, PermissionAction, ToolPermission } from './types/permission';
export {
  toolConfirmSchema,
  toolDebugExecuteSchema,
  type ToolConfirmInput,
  type ToolDebugExecuteInput,
} from './schemas/tool';

// 备份/恢复契约
export {
  CURRENT_BACKUP_SCHEMA_VERSION,
  backupTrackSchema,
  backupManifestSchema,
  backupProgressEventSchema,
  backupExportRequestSchema,
  backupPrecheckSchema,
  type BackupTrack,
  type BackupManifest,
  type BackupProgressEvent,
  type BackupExportRequest,
  type BackupPrecheck,
} from './backup';

// 桌面端自动更新契约（主进程 ↔ 渲染进程 IPC 载荷）
export {
  type UpdateChannel,
  type UpdateStatus,
  type FullUpdaterStatus,
  type WbfmUpdaterBridge,
} from './updater';

// 桌宠契约（M4 伴身：IPC 表现事件/桥类型/模型归一）
export {
  PET_SUBTITLE_MAX,
  type PetVoiceState,
  type PetPerformanceEvent,
  type WbfmPetBridge,
  normalizeAvatarModelId,
  sanitizePetEvent,
} from './pet';

// 命令面板契约（M5）
export {
  type Command,
  type CommandGroup,
  type CommandContext,
  type CommandRegistry,
  filterCommands,
  fuzzyMatch,
} from './command';

// API 契约
export {
  ok,
  fail,
  unwrapEnvelope,
  type ApiEnvelope,
  type ApiSuccess,
  type ApiFailure,
} from './api/envelope';
export {
  SSE_EVENT,
  formatSse,
  type SseEventName,
  type SsePayloadMap,
  type TokenUsage,
  type RecalledMemoryPayload,
} from './api/sse';
