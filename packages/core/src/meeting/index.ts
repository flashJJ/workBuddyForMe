/**
 * v1.9 M3 会议域（服务端）。
 * 浏览器侧只用纯映射（meeting-stage-adapter），经 @wbfm/core/stage-client 引入。
 */
export { createMeetingService } from './meeting-service';
export { createMeetingSpeaker } from './meeting-speaker';
export {
  buildMeetingMessages,
  buildMeetingSystem,
  buildTranscriptLines,
  clipSpeech,
  extractAutoSuggestion,
  mapMentionsToIds,
  meetingSlotsFor,
  parseMentionNames,
  validateAutoNext,
  type AutoNextDecision,
  type TranscriptEntry,
} from './meeting-protocol';
export type {
  MeetingEvent,
  MeetingService,
  MeetingServiceDeps,
  MeetingSpeaker,
  SpeakParams,
  SubmitTurnResult,
} from './meeting-types';
