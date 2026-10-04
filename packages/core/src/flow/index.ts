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
export { buildFlowTool, type FlowToolInvoker } from './flow-tool';
export {
  createFlowRunService,
  type FlowRunService,
  type FlowRunServiceDeps,
  type StartFlowParams,
  type StartedFlow,
} from './run-service';
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
