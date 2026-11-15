/** P8.8 主动播放：预算纯函数 + 服务端服务 */
export {
  markPlayback,
  normalizePlaybackIdleMinutes,
  normalizePlaybackPerDay,
  playbackBlockReason,
  playbackSummary,
  PET_SCRIPT_PLAYBACK_KEY,
  resolvePlaybackState,
  setPlaybackIdleMinutes,
  setPlaybackPerDay,
  type PlaybackBlockReason,
  type PlaybackState,
  type PetScriptPlaybackStore,
} from './playback';
export {
  createPetScriptPlaybackService,
  type PetScriptPlaybackDeps,
  type PetScriptPlaybackService,
} from './service';
