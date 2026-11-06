/**
 * @wbfm/voice —— v1.0「会说话的桌面伙伴」语音内核。
 *
 * 分层：
 * - engine/   ASR/TTS 引擎接口与错误模型（M0 接口，M1/M2 接 sherpa 实现）
 * - audio/    WAV 编解码、采样率工具（纯函数）
 * - text/     流式切句、TTS 文本清洗（纯函数）
 * - session/  语音会话状态机（纯函数，主窗/桌宠共用）
 * - models/   本地模型清单、镜像地址、完整性校验
 */
export type {
  AsrEngine,
  TtsEngine,
  AsrEngineConfig,
  TtsEngineConfig,
  AsrEngineFactory,
  TtsEngineFactory,
  AsrResult,
  TtsResult,
} from './engine/types';
export { VoiceEngineError } from './engine/types';

export {
  encodePcm16Wav,
  decodePcm16Wav,
  resampleLinear,
  ASR_SAMPLE_RATE,
  WAV_MIME,
  type DecodedWav,
} from './audio/wav-codec';

export {
  StreamingSentenceSplitter,
  splitSentences,
  stripForTts,
  chunkForTts,
  isSpeakableText,
  MIN_FIRST_CLAUSE,
  MAX_TTS_CHUNK,
  type SplitterOptions,
} from './text/sentence-splitter';

export {
  nextVoiceState,
  isVoiceTransitionAllowed,
  type VoiceState,
  type VoiceEvent,
  type VoiceTransition,
} from './session/voice-state';

export {
  VOICE_MODELS,
  getVoiceModelSpec,
  modelFileUrl,
  findMissingFiles,
  type VoiceModelKind,
  type VoiceModelSpec,
  type VoiceModelFile,
  type TtsEngineId,
} from './models/manifest';
export {
  downloadVoiceModel,
  defaultFs,
  type DownloadProgress,
  type DownloadModelOptions,
  type FsLike,
} from './models/downloader';

export { SherpaTtsEngine, defaultSherpaTtsLoader, createNativeTts } from './engine/sherpa/tts-engine';
export type {
  SherpaTtsOptions,
  SherpaTtsModule,
  SherpaTtsNative,
  SherpaTtsLoader,
} from './engine/sherpa/tts-engine';
export { WorkerTtsEngine } from './engine/sherpa/tts-worker';
export type { WorkerTtsOptions, TtsWorkerLike } from './engine/sherpa/tts-worker';
export { TTS_WORKER_SOURCE, resolveSherpaModulePath } from './engine/sherpa/tts-worker-source';
export { createSherpaTtsEngine } from './engine/sherpa/create-tts-engine';
export type { CreateTtsEngineOptions, TtsEngineMode } from './engine/sherpa/create-tts-engine';
export { buildNativeTtsConfig } from './engine/sherpa/tts-native-config';
export type { BuildNativeTtsConfigOptions, BuiltNativeTtsConfig } from './engine/sherpa/tts-native-config';
export { SherpaAsrEngine, defaultSherpaAsrLoader } from './engine/sherpa/asr-engine';
export type {
  SherpaAsrOptions,
  SherpaAsrModule,
  SherpaAsrRecognizer,
  SherpaAsrStream,
  SherpaAsrLoader,
} from './engine/sherpa/asr-engine';
