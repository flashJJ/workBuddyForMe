/** @域 barrel 情绪/关系内核（v1.6） */
export {
  normalizeEmotionState,
  createEmotionEvent,
  applyEmotionEvent,
  decayEmotionState,
  recordEmotion,
  type CreateEmotionEventInput,
} from './emotion-kernel';
export {
  createEmotionService,
  type EmotionService,
  type RecordEmotionInput,
} from './emotion-service';
export { EMOTION_DIRECTIVE_BLOCK, buildEmotionStateBlock } from './emotion-prompt';
export { inferSoulEventFromUserText } from './emotion-rule-guard';
export {
  resolveTurnEmotion,
  type ResolvedTurnEmotion,
  type ResolvedEmotionSource,
} from './emotion-turn';
