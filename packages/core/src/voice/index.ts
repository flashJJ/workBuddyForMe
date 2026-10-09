/**
 * @域 barrel 语音运行时（v1.1 M3 从 apps/web 下沉）。
 * 注意：本域依赖 @wbfm/voice（sherpa-onnx-node 原生绑定），刻意**不**聚合进 core 根
 * barrel——根 barrel 消费者无需被拉入原生模块图；语音能力只经 @wbfm/core/voice 子路径消费。
 * 引擎/编解码/模型下载等纯技术件仍在 @wbfm/voice，本域只做面向业务的运行时编排。
 */
export { VoiceRuntime } from './voice-runtime';
export { readVoiceSettings, patchVoiceSettings } from './voice-settings';
export { getVoiceModelsRoot, getModelDir } from './model-paths';
export type { DownloadJob, SynthResult, TranscribeResult } from './voice-runtime-types';
