/** 服务端生成器公开入口（API 路由只从这里引用） */
export { createPetScriptGenerator } from './service';
export type { PetScriptGenerator, PetScriptGeneratorDeps } from './service';
export {
  createPetScriptScheduler,
  PET_SCRIPT_SCHEDULE_KEY,
  quietHoursFrom,
  type PetScriptScheduler,
  type PetScriptSchedulerDeps,
  type QuietHours,
  type ScheduleState,
} from './schedule';
export { createPetScriptServer, type PetScriptServerDeps } from './server';
export {
  createPetScriptPlaybackService,
  PET_SCRIPT_PLAYBACK_KEY,
  type PlaybackState,
  type PetScriptPlaybackService,
} from './playback';
export {
  PET_SCRIPT_GENERATION_KEY,
  type PetScriptGenerationState,
} from './state';
export {
  PET_SCRIPT_STORY_KEY,
  type PetScriptStoryStore,
  type StoryState,
} from './story';
