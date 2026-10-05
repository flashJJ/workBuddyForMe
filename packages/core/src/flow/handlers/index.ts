import type { FlowHandlerRegistry, FlowNodeHandler } from '../types';
import { endNodeHandler } from './end';
import { startNodeHandler } from './start';
import { llmNodeHandler } from './llm';
import { knowledgeSearchNodeHandler } from './knowledge-search';
import { toolNodeHandler } from './tool';
import { conditionNodeHandler } from './condition';

export { startNodeHandler, type StartNodeOutputs } from './start';
export { endNodeHandler, type EndNodeConfig, type EndNodeOutputs } from './end';
export { llmNodeHandler, type LlmNodeConfig, type LlmNodeOutputs } from './llm';
export {
  knowledgeSearchNodeHandler,
  type KnowledgeSearchNodeConfig,
  type KnowledgeSearchNodeOutputs,
} from './knowledge-search';
export { toolNodeHandler, type ToolNodeConfig, type ToolNodeOutputs } from './tool';
export {
  conditionNodeHandler,
  type ConditionNodeConfig,
  type ConditionNodeOutputs,
  type ConditionRule,
  type ConditionOp,
  type ConditionMatch,
} from './condition';
export { evaluateCondition, evalRule, CONDITION_OPS } from './condition-eval';

/**
 * 默认处理器注册表（human 节点由引擎内联处理，不在此注册）。
 * 节点处理器都注册在这；引擎对 human/tool 有额外编排（挂起/门控）。
 */
export function createDefaultHandlers(): FlowHandlerRegistry {
  const handlers: FlowNodeHandler[] = [
    startNodeHandler,
    endNodeHandler,
    llmNodeHandler,
    knowledgeSearchNodeHandler,
    toolNodeHandler,
    conditionNodeHandler,
  ];
  return Object.fromEntries(handlers.map((h) => [h.type, h])) as FlowHandlerRegistry;
}
