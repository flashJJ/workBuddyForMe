/** M3 Utility 决策层：硬门控之后的候选打分与排序 */
export { DECISION_WEIGHTS, scoreCandidate } from './score';
export {
  rankCandidates,
  rankSceneCandidates,
  selectBestCandidate,
  toDecisionCandidate,
} from './select';
export {
  decisionReportContext,
  orderTriggerCandidates,
  type TriggerContextLike,
  type TriggerDecisionExtras,
  type TriggerOrderResult,
} from './trigger';
export type {
  DecisionCandidate,
  DecisionContext,
  RankedCandidate,
} from './types';
