/** v4.1：Utility 打分与排序契约（web 与离线评测共用） */
export { DECISION_WEIGHTS, scoreCandidate, type DecisionWeights } from './score';
export {
  rankCandidates,
  rankSceneCandidates,
  selectBestCandidate,
  toDecisionCandidate,
} from './select';
export type { DecisionCandidate, DecisionContext, RankedCandidate } from './types';
