/**
 * 本地语音模型清单（v1.0：sherpa-onnx SenseVoice ASR + MeloTTS 中英 TTS）。
 *
 * 模型不进安装包，首次启用时按清单下载到用户目录（userData/models/voice）。
 * 体积/文件列表来自 2026-10 在 hf-mirror 的实测（csukuangfj 仓库），用于：
 * 1) 下载前预估总大小；2) 落盘后做完整性校验（大小匹配 + 非空）。
 */

export interface VoiceModelFile {
  /** 相对模型根目录的路径（POSIX 风格） */
  path: string;
  /** 期望字节数（0 表示不校验大小，如未来加入的小文本文件） */
  size: number;
}

export type VoiceModelKind = 'asr' | 'tts';

export interface VoiceModelSpec {
  kind: VoiceModelKind;
  /** 模型标识，同时作为本地目录名 */
  id: string;
  label: string;
  /** HuggingFace 仓库（resolve 基址由镜像设置拼接） */
  hfRepo: string;
  files: VoiceModelFile[];
  /** 总字节数（files.size 求和的缓存） */
  totalBytes: number;
}

const HF_BASE = 'https://huggingface.co';
const HF_MIRROR_BASE = 'https://hf-mirror.com';

const ASR_SENSEVOICE: VoiceModelSpec = {
  kind: 'asr',
  id: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17',
  label: 'SenseVoice（中/英/日/粤，int8）',
  hfRepo: 'csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17',
  files: [
    { path: 'model.int8.onnx', size: 239_233_841 },
    { path: 'tokens.txt', size: 315_894 },
  ],
  totalBytes: 0,
};

const TTS_MELO_ZH_EN: VoiceModelSpec = {
  kind: 'tts',
  id: 'vits-melo-tts-zh_en',
  label: 'MeloTTS 中英女声（VITS int8）',
  hfRepo: 'csukuangfj/vits-melo-tts-zh_en',
  files: [
    { path: 'model.int8.onnx', size: 53_517_430 },
    { path: 'tokens.txt', size: 655 },
    { path: 'lexicon.txt', size: 6_837_671 },
    { path: 'date.fst', size: 59_154 },
    { path: 'number.fst', size: 64_482 },
    { path: 'phone.fst', size: 88_630 },
    { path: 'new_heteronym.fst', size: 21_974 },
    { path: 'dict/README.md', size: 683 },
    { path: 'dict/hmm_model.utf8', size: 519_739 },
    { path: 'dict/idf.utf8', size: 5_998_717 },
    { path: 'dict/jieba.dict.utf8', size: 5_071_204 },
    { path: 'dict/stop_words.utf8', size: 8_974 },
    { path: 'dict/user.dict.utf8', size: 49 },
    { path: 'dict/pos_dict/char_state_tab.utf8', size: 327_139 },
    { path: 'dict/pos_dict/prob_emit.utf8', size: 1_687_686 },
    { path: 'dict/pos_dict/prob_start.utf8', size: 4_347 },
    { path: 'dict/pos_dict/prob_trans.utf8', size: 124_159 },
  ],
  totalBytes: 0,
};

/** v1.0 支持的模型清单（按 kind 索引）。 */
export const VOICE_MODELS: Record<VoiceModelKind, VoiceModelSpec> = {
  asr: withTotals(ASR_SENSEVOICE),
  tts: withTotals(TTS_MELO_ZH_EN),
};

function withTotals(spec: VoiceModelSpec): VoiceModelSpec {
  return { ...spec, totalBytes: spec.files.reduce((sum, f) => sum + f.size, 0) };
}

/** 拼接某个模型文件的下载地址（默认走国内镜像）。 */
export function modelFileUrl(spec: VoiceModelSpec, file: VoiceModelFile, mirror = true): string {
  const base = mirror ? HF_MIRROR_BASE : HF_BASE;
  return `${base}/${spec.hfRepo}/resolve/main/${file.path}`;
}

/**
 * 校验模型目录内文件是否齐备（纯 IO 无关：把 stat 函数注入，方便测试）。
 * 返回缺失/大小不符的文件路径列表；空数组 = 就绪。
 */
export async function findMissingFiles(
  spec: VoiceModelSpec,
  stat: (relPath: string) => Promise<number | null>,
): Promise<string[]> {
  const missing: string[] = [];
  for (const file of spec.files) {
    const size = await stat(file.path);
    if (size === null || (file.size > 0 && size !== file.size)) {
      missing.push(file.path);
    }
  }
  return missing;
}
