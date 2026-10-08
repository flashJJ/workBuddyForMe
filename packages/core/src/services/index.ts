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
} from './task-runner-service';
export {
  createSettingsService,
  DEFAULT_SETTINGS,
  type SettingsService,
} from './settings-service';
export {
  createAssistantsService,
  type AssistantsService,
} from './assistant-service';
export { ensureSeedData, BUILTIN_ASSISTANT } from './seed';
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
