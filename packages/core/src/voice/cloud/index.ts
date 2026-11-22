/** 在线 TTS 子域：腾讯云凭据、引擎与运行时管理 */
export { createVoiceCloudCredentialStore } from './voice-cloud-credentials';
export type {
  CloudTtsCredentials,
  VoiceCloudCredentialStore,
  VoiceCloudCredentialStoreOptions,
} from './voice-cloud-credentials';
export { VoiceCloudTts } from './voice-cloud-tts';
export {
  TencentTtsEngine,
  buildTencentAuthorization,
  mapTencentSpeed,
  decodePcm16,
} from './tencent-tts-engine';
export type { TencentTtsEngineOptions } from './tencent-tts-engine';
