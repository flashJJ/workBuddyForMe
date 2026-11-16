/** v4.2 音频导演：统一 mute / duck / 背景互斥与首次手势解锁 */
export { AudioDirector, audioDirector } from './director';
export { useAudioDirector } from './use-audio-director';
export { AUDIO_DUCK_RATIO, AUDIO_MUTED_STORAGE_KEY, AUDIO_SFX_MAX_CONCURRENT } from './constants';
export type {
  AudioBackgroundKind,
  AudioDirectorListener,
  AudioDirectorSnapshot,
  AudioSink,
  AudioTrackKind,
} from './types';
