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
