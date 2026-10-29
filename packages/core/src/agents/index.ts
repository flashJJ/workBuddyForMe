/** @域 barrel v1.4 多智能体协作（M0 契约在 @wbfm/shared；M1 内核在本域） */
export {
  createBudgetState,
  toUsage,
  consume,
  advanceRound,
  totalTokens,
  exceededReason,
  shouldStop,
  isBudgetWithinBounds,
  type BudgetState,
  type BudgetExceeded,
  type BudgetLimitKind,
} from './budget';
export {
  PLANNER_SYSTEM_PROMPT,
  PlannerProtocolError,
  buildAgentPlannerMessages,
  extractJsonObject,
  parsePlan,
  type PlannerPromptInput,
  type PlannerHistoryEntry,
  type ParsePlanResult,
} from './planner-protocol';
export {
  REVIEWER_SYSTEM_PROMPT,
  ReviewerProtocolError,
  buildReviewMessages,
  parseVerdict,
  checkAcceptanceStructural,
  type ReviewerPromptInput,
  type AcceptanceStructuralCheck,
  type ParseVerdictResult,
} from './reviewer-protocol';
export {
  createSupervisorState,
  transition,
  isTerminal,
  SupervisorTransitionError,
  type SupervisorState,
  type SupervisorEvent,
  type SupervisorTransition,
  type SupervisorTerminalReason,
} from './supervisor';
export {
  AGENT_PROTOCOL_FAILURE_LIMITS,
  buildFallbackSubtask,
  buildFallbackVerdict,
  withBudgetNote,
} from './runner-fallbacks';
export { createAgentRunner, type AgentRunEvent } from './agent-runner';
export { createExecutorAdapter, resolveAllowedTools, DESKTOP_BUILTIN_TOOLS } from './executor-adapter';
export type {
  CreateExecutorAdapterParams,
  ExecutorPlannerResolution,
  ObserveMode,
} from './executor-adapter';
export { buildExecutorOutcome, collectEvidence, collectToolCalls } from './executor-outcome';
export type { BuildExecutorOutcomeInput } from './executor-outcome';
export {
  resolveRoleTarget,
  targetHasVision,
  AGENT_ROLE_MODEL_FIELDS,
  type AgentRoleKey,
} from './role-models';
export { createLlmPlannerClient, createLlmReviewerClient } from './llm-agent-clients';
export {
  createAgentRunService,
  type AgentRunService,
  type AgentRunServiceDeps,
  type AgentRunStartParams,
  type AgentRunOwnedParams,
  type AgentClientsProvider,
  type AgentClientOverrides,
  type AgentPlanContextResolver,
  type FlowNodeStartParams,
} from './agent-run-service';
export {
  createSubagentProviderRegistry,
  type SubagentProvider,
  type SubagentProviderRegistry,
  type SubagentProviderInput,
  type SubagentProviderResult,
} from './subagent-provider';
export {
  createCliSubagentProvider,
  minimalSubagentEnv,
  type CliSubagentProviderOptions,
} from './cli-subagent-provider';
export {
  resolveCommandPath,
  validateSubagentCwd,
  type ResolveCommandOptions,
  type ValidateCwdOptions,
} from './cli-command';
export {
  parseCliLine,
  buildRunLine,
  buildPermissionResultLine,
  isFatalParseFailure,
  CLI_MAX_LINE_BYTES,
  CLI_MAX_DIAGNOSTICS,
  CLI_MAX_STDERR_BYTES,
  type CliFrame,
  type CliParseResult,
} from './cli-protocol';
export {
  createSubagentRunService,
  type SubagentRunService,
  type SubagentRunServiceDeps,
} from './subagent-run-service';
export type {
  AgentClients,
  AgentRunnerDeps,
  PlannerClient,
  ReviewerClient,
  ExecutorClient,
  StartAgentRunInput,
  RoleModelUsage,
  PlannerRoundHistory,
} from './runner-types';
