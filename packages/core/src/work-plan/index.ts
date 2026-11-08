/** v2.8 目标 / 计划 / 待办（core barrel） */
export {
  createWorkPlanService,
  type WorkPlanService,
  type TodoInput,
  type WorkPlanServiceHooks,
} from './work-plan-service';
export { buildPlanPromptBlock } from './plan-prompt';
export {
  buildCheckpointPromptBlock,
  buildTaskCheckpointSnapshot,
  summarizeLastTool,
  type TaskCheckpointContext,
  type TaskCheckpointOptions,
  type TaskCheckpointSnapshot,
} from './task-checkpoint';
export {
  createRunCompletionService,
  type RunCompletionService,
} from './run-completion';
export {
  createStagePlanService,
  validateStagePlanBindings,
  validateStagePlanInput,
  type StagePlanService,
} from './stage-plan-service';
