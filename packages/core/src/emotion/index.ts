/** @域 barrel 情绪/关系内核（v1.6；v2.0 关系等级同域） */
export {
  normalizeEmotionState,
  createEmotionEvent,
  applyEmotionEvent,
  decayEmotionState,
  recordEmotion,
  type CreateEmotionEventInput,
} from './emotion-kernel';
export {
  applyRelationshipEvent,
  evaluateFloorAtCheckpoint,
  displayLevelOf,
  isRelationshipUnlocked,
  levelScoreOf,
  levelFromScore,
  normalizeRelationshipBlock,
  createDefaultRelationshipBlock,
  defaultRelationshipBlock,
  type RelationScores,
  type RelationshipEventResult,
} from './relationship-kernel';
export {
  createEmotionService,
  type EmotionService,
  type RecordEmotionInput,
} from './emotion-service';
export { createMilestoneService, type MilestoneService } from './milestone-service';
export { evaluateMilestones, dayKeyBetween, type MilestoneStats } from './milestone';
export { EMOTION_DIRECTIVE_BLOCK, buildEmotionStateBlock } from './emotion-prompt';
export { inferSoulEventFromUserText } from './emotion-rule-guard';
export {
  resolveTurnEmotion,
  recordTurnEmotion,
  type ResolvedTurnEmotion,
  type ResolvedEmotionSource,
  type RecordTurnEmotionParams,
  type RecordedTurnEmotion,
} from './emotion-turn';
