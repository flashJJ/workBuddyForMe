/** @域 barrel 错误模型（v1.1 M2 域子路径化） */
export { ERROR_CODES, httpStatusFor, type ErrorCode } from './error-codes';
export { ApiError, type ApiErrorBody } from './api-error';
// v4.18 A 线：模型失败分类、自动切换判定与切换事件契约
export {
  MAX_MODEL_SWITCH_ATTEMPTS,
  MODEL_FAILURE_AUTO_SWITCH,
  MODEL_FAILURE_CODES,
  canAutoSwitchModel,
  isModelFailureCode,
  type ModelFailure,
  type ModelFailureCode,
  type ModelFailurePhase,
  type ModelSwitchEvent,
} from './model-failure';
