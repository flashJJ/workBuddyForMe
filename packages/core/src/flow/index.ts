// v0.8 Flow Studio 执行内核（M0：图编译 + start/end 引擎骨架）
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
export {
  createDefaultHandlers,
  startNodeHandler,
  endNodeHandler,
  type StartNodeOutputs,
  type EndNodeConfig,
} from './handlers';
export type {
  CompiledFlow,
  SuccessorRef,
  FlowScope,
  FlowExecutionContext,
  FlowNodeHandler,
  FlowHandlerRegistry,
  RunFlowOptions,
} from './types';
