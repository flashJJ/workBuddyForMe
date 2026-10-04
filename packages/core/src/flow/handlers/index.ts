import type { FlowHandlerRegistry } from '../types';
import { endNodeHandler } from './end';
import { startNodeHandler } from './start';

export { startNodeHandler, type StartNodeOutputs } from './start';
export { endNodeHandler, type EndNodeConfig, type EndNodeOutputs } from './end';

/** M0 默认处理器（start/end）；M1 在此注册 llm/knowledgeSearch/tool/condition/human */
export function createDefaultHandlers(): FlowHandlerRegistry {
  return {
    start: startNodeHandler,
    end: endNodeHandler,
  };
}
