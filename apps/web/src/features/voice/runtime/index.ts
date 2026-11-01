/** @子域 barrel voice/runtime：语音设置与播放运行时（跨域能力入口） */
export { useVoiceSettings } from '../use-voice-settings';
export { useHandsfreeVoice } from '../use-handsfree-voice';
export type { HandsfreeVoice, HandsfreeVoiceOptions } from '../use-handsfree-voice';
export { useVoicePlayback } from '../use-voice-playback';
export type { VoicePlayback } from '../use-voice-playback';
export { AudioPlaybackQueue } from '../audio-playback-queue';
export type { AudioPlayer, VoiceAudioFrame, VoiceState } from '../audio-playback-queue';
export { useVoiceModelDownloads } from '../settings/use-voice-model-downloads';
export type { ModelDownloadState, ModelDownloadView } from '../settings/use-voice-model-downloads';
