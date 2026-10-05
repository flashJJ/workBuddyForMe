// v0.8 Flow Studio 执行内核
export { compileFlow, type CompileResult } from './compiler';
export { runFlow } from './engine';
export {
  resolveFlowRefs,
  extractReferences,
  RefResolutionError,
} from './refs';
export {
  buildAdjacency,
  topoSortKahn,
  findCyclePath,
  reachableFrom,
  reverseReachableTo,
  type Adjacency,
} from './graph-utils';
export { buildIncomingIndex, isNodeLive, type IncomingEdge } from './engine-live';
export {
  createDefaultHandlers,
  startNodeHandler,
  endNodeHandler,
  llmNodeHandler,
  knowledgeSearchNodeHandler,
  toolNodeHandler,
  conditionNodeHandler,
  evaluateCondition,
  evalRule,
  CONDITION_OPS,
  type StartNodeOutputs,
  type EndNodeConfig,
  type LlmNodeConfig,
  type LlmNodeOutputs,
  type KnowledgeSearchNodeConfig,
  type KnowledgeSearchNodeOutputs,
  type ToolNodeConfig,
  type ToolNodeOutputs,
  type ConditionNodeConfig,
  type ConditionNodeOutputs,
  type ConditionRule,
  type ConditionOp,
  type ConditionMatch,
} from './handlers';
export { createFlowWaitRegistry, type FlowWaitRegistry } from './wait-registry';
export { createFlowRunStore, type FlowRunStore } from './run-store';
export { buildFlowTool, type FlowToolInvoker, type FlowChatInvokeResult } from './flow-tool';
export { createChatInvoker, type ChatInvokeDeps } from './chat-invoke';
export { resolveRunRuntimeOverrides, type RunRuntimeOverrides } from './run-options';
export {
  flowEventToSubstep,
  createSubstepCollector,
  flowNodeTitle,
  FLOW_NODE_DEFAULT_LABELS,
  type FlowSubstepCollector,
} from './flow-substeps';
export { STARTER_FLOWS, type StarterFlowDef } from './starters/starters';
export { ensureStarterFlows } from './starters/seed-starter-flows';
export {
  createFlowRunService,
  type FlowRunService,
  type FlowRunServiceDeps,
  type CreateRunParams,
} from './run-service';
export { createFlowEventBus, isTerminalFlowEvent, type FlowEventBus } from './queue/event-bus';
export { createFlowRunQueue, type FlowRunQueue } from './queue/run-queue';
export { waitForRunTerminal, isTerminalRun, type TerminalWaitResult } from './queue/terminal-wait';
export { computeReplayClosure } from './replay';
export {
  evaluateUnattendedPolicy,
  policyDenyText,
  type PolicyDecision,
  type PolicyDecisionReason,
} from './policy-gate';
export {
  recoverInterruptedRuns,
  RECOVERY_REASON_PROCESS_RESTART,
  type RecoveryResult,
} from './queue/recovery-scanner';
export { createFlowExecutor, type FlowExecutor, type FlowExecutionParams } from './flow-execution';
export type {
  CompiledFlow,
  SuccessorRef,
  FlowScope,
  FlowNodeState,
  FlowExecutionContext,
  FlowNodeHandler,
  FlowHandlerRegistry,
  RunFlowOptions,
  FlowHumanDecision,
  FlowToolConfirmationRequest,
  FlowChatTarget,
} from './types';
