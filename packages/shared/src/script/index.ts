/** v4.1：Utility 打分与排序契约（web 与离线评测共用） */
export { DECISION_WEIGHTS, baseScore, scoreCandidate, type DecisionWeights } from './score';
export {
  rankCandidates,
  rankSceneCandidates,
  selectBestCandidate,
  toDecisionCandidate,
} from './select';
export type { DecisionCandidate, DecisionContext, RankedCandidate } from './types';
export {
  DEFAULT_EVAL_CONTEXTS,
  diffMatrix,
  runMatrix,
  toCandidateFromSnapshot,
  toDecisionContext,
} from './eval/matrix';
export { replayDecisions } from './eval/replay';
export { attachGate, summarizeDecisions } from './eval/metrics';
export type {
  CompanionCandidateSnapshot,
  CompanionEvalContext,
  CompanionMatrixRank,
  CompanionMatrixRow,
  CompanionQualityReport,
  CompanionRankDiff,
  CompanionReplayRow,
  CompanionReplaySummary,
  QualityGateSnapshot,
} from './eval/types';
