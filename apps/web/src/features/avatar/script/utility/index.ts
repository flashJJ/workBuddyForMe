/** M3 Utility 决策层：硬门控之后的候选打分与排序（阶段 1 只用于主动播放） */
export { DECISION_WEIGHTS, scoreCandidate } from './score';
export { rankCandidates, selectBestCandidate, toDecisionCandidate } from './select';
export type {
  DecisionCandidate,
  DecisionContext,
  RankedCandidate,
} from './types';
