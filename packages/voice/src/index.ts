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
  MIN_FIRST_CLAUSE,
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
  modelFileUrl,
  findMissingFiles,
  type VoiceModelKind,
  type VoiceModelSpec,
  type VoiceModelFile,
} from './models/manifest';
export {
  downloadVoiceModel,
  defaultFs,
  type DownloadProgress,
  type DownloadModelOptions,
  type FsLike,
} from './models/downloader';

export { SherpaTtsEngine, defaultSherpaTtsLoader } from './engine/sherpa/tts-engine';
export type {
  SherpaTtsOptions,
  SherpaTtsModule,
  SherpaTtsNative,
  SherpaTtsLoader,
} from './engine/sherpa/tts-engine';
