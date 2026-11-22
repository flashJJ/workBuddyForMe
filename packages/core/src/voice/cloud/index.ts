/** 在线 TTS 子域：腾讯云凭据、微软 Edge 免密钥引擎与运行时管理 */
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
export { EdgeTtsEngine } from './edge-tts-engine';
export type {
  EdgeMp3Decode,
  EdgeSocket,
  EdgeSocketFactory,
  EdgeTtsEngineOptions,
} from './edge-tts-engine';
export {
  EDGE_SEC_MS_GEC_VERSION,
  EDGE_TRUSTED_CLIENT_TOKEN,
  generateEdgeSecMsGec,
} from './edge-tts-token';
