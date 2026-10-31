export {
  DEFAULT_SENSITIVE_PATH_NAMES,
  assertPathInsideWorkspace,
  isPathInside,
  isSensitivePath,
  resolveWorkspacePath,
  type WorkspaceValidationOptions,
} from './workspace';
export {
  agentPolicyHash,
  evaluateAgentPolicy,
  evaluateCommandPolicy,
  extractDomain,
  extractPathTargets,
  isDesktopControlTool,
  matchesDomainRule,
  matchesToolRule,
} from './policy';
export {
  assertBindingMatches,
  bindingDriftDetails,
  computeOperationBinding,
  summarizeBinding,
  type ComputeBindingInput,
} from './binding';
export {
  auditCritical,
  createAuditService,
  type AuditAppendInput,
  type AuditEventListPage,
  type AuditService,
} from './audit';
export {
  buildAuditArchive,
  type AuditArchiveBundle,
  type AuditArchiveDeps,
} from './audit-archive';
export { verifyAuditAnchor } from './audit-anchor';
