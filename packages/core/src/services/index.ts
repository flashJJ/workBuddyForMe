/** @域 barrel 服务/仓储装配层（v1.1 M2 域子路径化） */
export type { ServiceDeps } from './deps';
export { createProviderService, type ProviderService } from './provider-service';
export { createModelService, type ModelService } from './model-service';
export { buildProvider, toApiError } from './provider-adapter';
export {
  createPermissionService,
  type PermissionService,
} from './permission-service';
export {
  createPendingConfirmations,
  CONFIRMATION_TIMEOUT_MS,
  type PendingConfirmations,
  type ConfirmationDecision,
} from './pending-confirmations';
export {
  createTaskGrantRegistry,
  type TaskGrantRegistry,
} from './task-grants';
export {
  createTaskRunnerService,
  type TaskRunnerService,
  type TaskStartParams,
  type TaskRunnerDeps,
} from './task-runner-service';
export {
  recoverInterruptedRunJobs,
  convergeOrphanTaskRun,
} from './run-recovery';
export {
  createSettingsService,
  DEFAULT_SETTINGS,
  type SettingsService,
} from './settings-service';
export {
  enableDemoMode,
  disableDemoMode,
  type DemoModeArtifacts,
} from './demo-provider';
export {
  probeLocalOllama,
  LOCAL_OLLAMA_URL,
  OLLAMA_PROBE_TIMEOUT_MS,
} from './ollama-probe';
export {
  streamOllamaPull,
  type OllamaPullProgress,
  type OllamaPullOptions,
} from './ollama-pull';
export {
  probeFirstToken,
  FIRST_TOKEN_PROBE_PROMPT,
  FIRST_TOKEN_PROBE_TIMEOUT_MS,
  type FirstTokenProbeOutcome,
} from './first-token-probe';
export { recordMilestone, type TtfvMilestone } from './milestones';
export {
  createAssistantsService,
  type AssistantsService,
} from './assistant-service';
export {
  createCharacterCardService,
  type CharacterCardService,
} from './character-card-service';
export {
  createStageSceneService,
  type StageSceneService,
} from './stage-scene-service';
export {
  ensureSeedData,
  ensureBuiltinCharacterCards,
  migrateLegacySystemPrompts,
  BUILTIN_ASSISTANT,
  LEGACY_CARD_MIGRATION_KEY,
} from './seed';
export { buildIdentityCardMarkdown, createIdentityCard } from './persona-card';
export { createKnowledgeService, type KnowledgeService } from './knowledge-service';
export {
  createDocumentService,
  hashContent,
  type DocumentService,
  type UploadedFile,
} from './document-service';
export {
  createConversationService,
  deriveTitle,
  type ConversationService,
} from './conversation-service';
export {
  createAttachmentService,
  type AttachmentService,
  type AttachmentInput,
  type ResolvedImage,
} from './attachment-service';
export {
  createVrmAvatarService,
  type VrmAvatarService,
} from './vrm-avatar-service';
export {
  createMotionService,
  type MotionService,
} from './motion-service';
export {
  createModPackService,
  type ModPackService,
  type ModPackServiceDeps,
  type ExportCandidate,
} from './mod-pack-service';
export type {
  PackPreview,
  PackPreviewEntry,
  PackPreviewPackInfo,
  PackImportResult,
  PackImportEntryResult,
  PackEntryKind,
} from './mod-pack/pack-types';
