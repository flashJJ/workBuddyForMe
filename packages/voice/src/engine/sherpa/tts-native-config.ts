import path from 'node:path';
import type { TtsEngineConfig } from '../types';
import { VoiceEngineError } from '../types';
import type { VoiceModelSpec } from '../../models/manifest';

/** MeloTTS 中文规整四件套（存在才拼） */
export const MELO_RULE_FSTS = ['number.fst', 'phone.fst', 'date.fst', 'new_heteronym.fst'] as const;
/** Kokoro 中文规整三件套 */
export const KOKORO_ZH_FSTS = ['date-zh.fst', 'number-zh.fst', 'phone-zh.fst'] as const;
const MODEL_FILE = 'model.onnx';

export interface BuildNativeTtsConfigOptions {
  config: TtsEngineConfig;
  spec: VoiceModelSpec;
  /** 启用哪些规则 fst；缺省按引擎类型全开（存在才拼） */
  ruleFsts?: readonly string[];
  /** 文件存在性检查（生产 fs.existsSync，测试注入） */
  exists: (p: string) => boolean;
}

export interface BuiltNativeTtsConfig {
  /** 可直接结构化克隆进 worker 的 OfflineTts 构造参数 */
  nativeConfig: Record<string, unknown>;
  isKokoro: boolean;
}

/**
 * 校验模型文件并构造原生 OfflineTts 配置。
 *
 * 抽成纯函数（exists 可注入）：inline 引擎与 worker 引擎共用同一份配置逻辑，
 * 两条路径不会对 melo/kokoro 分支产生分歧。文件缺失抛 VoiceEngineError，
 * 由上层转成「去语音设置下载模型」的引导。
 */
export function buildNativeTtsConfig(options: BuildNativeTtsConfigOptions): BuiltNativeTtsConfig {
  const { config, spec, exists } = options;
  const modelDir = config.modelDir;
  const isKokoro = Boolean(config.kokoro);

  const required = isKokoro
    ? ['model.onnx', 'tokens.txt', 'voices.bin', path.join('espeak-ng-data', 'phontab'), 'lexicon-zh.txt']
    : [MODEL_FILE, 'tokens.txt', 'lexicon.txt'];
  for (const rel of required) {
    if (!exists(path.join(modelDir, rel))) {
      throw new VoiceEngineError(
        'tts',
        `模型文件缺失：${rel}`,
        `请在语音设置中下载「${spec.label}」或检查模型目录`,
      );
    }
  }

  const meloFsts = (options.ruleFsts ?? MELO_RULE_FSTS)
    .map((f) => path.join(modelDir, f))
    .filter((f) => exists(f))
    .join(',');
  const dictDir = exists(path.join(modelDir, 'dict')) ? path.join(modelDir, 'dict') : '';
  const kokoroFsts = isKokoro
    ? (config.kokoro?.ruleFsts ??
      KOKORO_ZH_FSTS.map((f) => path.join(modelDir, f))
        .filter((f) => exists(f))
        .join(','))
    : '';
  const ruleFsts = isKokoro ? kokoroFsts : meloFsts;

  // Kokoro：model.kokoro（多说话人，voices.bin + espeak 数据 + 中英词典）；
  // MeloTTS：model.vits（单说话人，jieba dict 内联配置）。
  const model = isKokoro
    ? {
        kokoro: {
          model: path.join(modelDir, MODEL_FILE),
          voices: config.kokoro!.voices,
          tokens: path.join(modelDir, 'tokens.txt'),
          dataDir: config.kokoro!.dataDir,
          lexicon: config.kokoro!.lexicon,
        },
      }
    : {
        vits: {
          model: path.join(modelDir, MODEL_FILE),
          lexicon: path.join(modelDir, 'lexicon.txt'),
          tokens: path.join(modelDir, 'tokens.txt'),
          dataDir: '',
          dictDir,
        },
      };

  return {
    isKokoro,
    nativeConfig: {
      model,
      numThreads: config.numThreads ?? 4,
      debug: false,
      provider: config.provider ?? 'cpu',
      // Kokoro 前端强制 max_num_sentences=1（传 2 会被原生层忽略并逐次刷警告）
      maxNumSentences: isKokoro ? 1 : 2,
      ...(ruleFsts ? { ruleFsts } : {}),
    },
  };
}
