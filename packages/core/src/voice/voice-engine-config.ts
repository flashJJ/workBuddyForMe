import path from 'node:path';
import type { AsrEngineConfig, TtsEngineConfig, VoiceModelSpec } from '@wbfm/voice';
import type { VoiceSettings } from '@wbfm/shared/schemas';

/**
 * TTS/ASR 引擎单例惰性重建用的纯函数：缓存键构造与引擎配置构造。
 *
 * 只搬代码不改逻辑：键的字段顺序、melo/kokoro 引擎条件分支与原 ensure* 内联实现逐字一致；
 * sid 逐句传入不进 TTS 键（见 voice-runtime 的 synthesize）。
 */

/** TTS 引擎缓存键：含模型（melo/kokoro 配置不同）、模型目录、速度、线程数 */
export function ttsConfigKey(spec: VoiceModelSpec, modelDir: string, s: VoiceSettings): string {
  return [spec.id, modelDir, s.ttsSpeed, s.ttsNumThreads].join('|');
}

/** ASR 引擎缓存键：模型目录 + 推理线程数 */
export function asrConfigKey(modelDir: string, s: VoiceSettings): string {
  return [modelDir, s.asrNumThreads].join('|');
}

/**
 * 按所选 TTS 模型规格构造引擎配置。
 * MeloTTS 为单说话人模型（speakerId 恒 0）；Kokoro 才注入多说话人资源：
 * voices 嵌入库 + espeak 数据 + 中英词典 + 中文规整 FST。
 */
export function buildTtsEngineConfig(
  spec: VoiceModelSpec,
  modelDir: string,
  s: VoiceSettings,
): TtsEngineConfig {
  return spec.engine === 'melo'
    ? {
        // VITS 路径由 SherpaTtsEngine 按 modelDir 自行拼出（model/lexicon/tokens/dict）
        modelDir,
        speakerId: 0,
        speed: s.ttsSpeed,
        numThreads: s.ttsNumThreads,
        provider: 'cpu',
      }
    : {
        modelDir,
        speakerId: s.ttsSpeakerId,
        speed: s.ttsSpeed,
        numThreads: s.ttsNumThreads,
        provider: 'cpu',
        kokoro: {
          voices: path.join(modelDir, 'voices.bin'),
          dataDir: path.join(modelDir, 'espeak-ng-data'),
          lexicon: [
            path.join(modelDir, 'lexicon-us-en.txt'),
            path.join(modelDir, 'lexicon-zh.txt'),
          ].join(','),
          ruleFsts: ['date-zh.fst', 'number-zh.fst', 'phone-zh.fst']
            .map((f) => path.join(modelDir, f))
            .join(','),
        },
      };
}

/** ASR（SenseVoice 16k）引擎配置：模型目录 + 推理线程数，CPU 推理 */
export function buildAsrEngineConfig(modelDir: string, s: VoiceSettings): AsrEngineConfig {
  return {
    modelDir,
    numThreads: s.asrNumThreads,
    provider: 'cpu',
  };
}
