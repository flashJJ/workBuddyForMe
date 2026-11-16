/** v4.2 音频导演：统一 mute / duck / 背景互斥与首次手势解锁 */
export { AudioDirector, audioDirector } from './director';
export { useAudioDirector } from './use-audio-director';
export {
  useAudioOutputDevices,
  type AudioOutputDevice,
} from './use-audio-output-devices';
export {
  AUDIO_DUCK_RATIO,
  AUDIO_MUTED_STORAGE_KEY,
  AUDIO_OUTPUT_STORAGE_KEY,
  AUDIO_SFX_MAX_CONCURRENT,
} from './constants';
export {
  applySinkId,
  normalizeOutputDevice,
  type SinkIdResult,
  type SinkIdTarget,
} from './output-device';
export { AudioOutputPanel } from './settings/audio-output-panel';
export type {
  AudioBackgroundKind,
  AudioDirectorListener,
  AudioDirectorSnapshot,
  AudioSink,
  AudioTrackKind,
} from './types';
