import { KOKORO_FILES } from './manifest-kokoro-files';

/**
 * 本地语音模型清单（v1.0：sherpa-onnx SenseVoice ASR + Kokoro 中英多说话人 TTS）。
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
  /** LFS 大文件的 SHA256（小文件可省略，仅做 size 校验） */
  sha256?: string;
  /** 直接下载地址（优先于 hfRepo 拼接；用于非 HF 托管的独立 vocoder） */
  url?: string;
  /** 主地址失败时的备用地址（按顺序尝试） */
  fallbackUrls?: string[];
}

export type VoiceModelKind = 'asr' | 'tts';
/** TTS 可选引擎（MeloTTS 单声低延迟 / Kokoro 多角色 / Matcha 快速单声） */
export type TtsEngineId = 'melo' | 'kokoro' | 'matcha';

export interface VoiceModelSpec {
  kind: VoiceModelKind;
  /** 模型标识，同时作为本地目录名 */
  id: string;
  label: string;
  /** 引擎类型（kind=tts 时必填） */
  engine?: TtsEngineId;
  /** HuggingFace 仓库（resolve 基址由镜像设置拼接） */
  hfRepo: string;
  /** 固定 revision（commit sha）；缺省 main，仅用于未固定的旧模型 */
  revision?: string;
  files: VoiceModelFile[];
  /** 总字节数（files.size 求和的缓存） */
  totalBytes: number;
}

export const HF_BASE = 'https://huggingface.co';
export const HF_MIRROR_BASE = 'https://hf-mirror.com';
/** Kokoro 当前固定 revision；升级模型时同步更新 manifest 快照 */
export const KOKORO_REVISION = '423bfb9ccd6a66115a76602a9630ffea265ae176';

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
  engine: 'melo',
  id: 'vits-melo-tts-zh_en',
  label: 'MeloTTS 中英女声（VITS fp32，单声低延迟）',
  hfRepo: 'csukuangfj/vits-melo-tts-zh_en',
  files: [
    // Node 侧 onnxruntime 在无 AVX512-VNNI 的 CPU 上 int8 内核退化（Arrow Lake 实测），
    // fp32 反而更快；故 MeloTTS 与 Kokoro 均保留 fp32 模型清单。
    { path: 'model.onnx', size: 170_429_550 },
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

/**
 * Matcha 中文女声：RTF 远低于 Kokoro（桌面 ~0.08），用于「首音优先」场景。
 * 声学模型与 jieba 词典走 HF；独立 vocoder 只在 GitHub release 托管，
 * 主地址在国内常被重置，附带 ghproxy 备用地址。
 */
const TTS_MATCHA_ZH_BAKER: VoiceModelSpec = {
  kind: 'tts',
  engine: 'matcha',
  id: 'matcha-icefall-zh-baker',
  label: 'Matcha 中文女声（快速本地合成，单声）',
  hfRepo: 'csukuangfj/matcha-icefall-zh-baker',
  revision: '6ccce73a41f1f4be966c485c75bcbf9d13df4819',
  files: [
    { path: 'model-steps-3.onnx', size: 75_624_188 },
    { path: 'tokens.txt', size: 19_591 },
    { path: 'lexicon.txt', size: 1_363_705 },
    { path: 'date.fst', size: 59_154 },
    { path: 'number.fst', size: 64_482 },
    { path: 'phone.fst', size: 88_630 },
    { path: 'dict/hmm_model.utf8', size: 519_739 },
    { path: 'dict/idf.utf8', size: 5_998_717 },
    { path: 'dict/jieba.dict.utf8', size: 5_071_204 },
    { path: 'dict/stop_words.utf8', size: 8_974 },
    { path: 'dict/user.dict.utf8', size: 829_194 },
    { path: 'dict/pos_dict/char_state_tab.utf8', size: 327_139 },
    { path: 'dict/pos_dict/prob_emit.utf8', size: 1_687_686 },
    { path: 'dict/pos_dict/prob_start.utf8', size: 4_347 },
    { path: 'dict/pos_dict/prob_trans.utf8', size: 124_159 },
    {
      path: 'vocos-22khz-univ.onnx',
      size: 53_884_024,
      url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/vocoder-models/vocos-22khz-univ.onnx',
      fallbackUrls: [
        'https://ghproxy.net/https://github.com/k2-fsa/sherpa-onnx/releases/download/vocoder-models/vocos-22khz-univ.onnx',
      ],
    },
  ],
  totalBytes: 0,
};

const TTS_KOKORO_ZH_EN: VoiceModelSpec = {
  kind: 'tts',
  engine: 'kokoro',
  id: 'kokoro-multi-lang-v1_1',
  label: 'Kokoro 多角色声线（103 音色）',
  hfRepo: 'csukuangfj/kokoro-multi-lang-v1_1',
  revision: KOKORO_REVISION,
  files: KOKORO_FILES,
  totalBytes: 0,
};

/** v1.x 支持的语音模型清单：asr 固定一个；tts 提供 MeloTTS（低延迟单声）、
 *  Kokoro（多角色）与 Matcha（快速单声）。用 satisfies 保留窄类型
 *  （asr 单规格、tts 数组），避免访问侧被宽联合类型拖累 */
export const VOICE_MODELS = {
  asr: withTotals(ASR_SENSEVOICE),
  tts: [
    withTotals(TTS_MELO_ZH_EN),
    withTotals(TTS_KOKORO_ZH_EN),
    withTotals(TTS_MATCHA_ZH_BAKER),
  ],
} satisfies Record<VoiceModelKind, VoiceModelSpec | VoiceModelSpec[]>;

function withTotals(spec: VoiceModelSpec): VoiceModelSpec {
  return { ...spec, totalBytes: spec.files.reduce((sum, f) => sum + f.size, 0) };
}

/** 按 kind+engine 取模型规格（tts 缺省回落 MeloTTS，与 shared 的 D9 默认一致） */
export function getVoiceModelSpec(
  kind: VoiceModelKind,
  engine?: TtsEngineId,
): VoiceModelSpec {
  const entry = VOICE_MODELS[kind];
  if (Array.isArray(entry)) {
    const wanted = engine ?? 'melo';
    return entry.find((m) => m.engine === wanted) ?? entry[entry.length - 1]!;
  }
  return entry;
}

/** 拼接某个模型文件的下载地址（默认走国内镜像；revision 固定时不会跟随 main）。 */
export function modelFileUrl(
  spec: VoiceModelSpec,
  file: VoiceModelFile,
  mirrorBase: string = HF_MIRROR_BASE,
): string {
  if (file.url) return file.url;
  const base = mirrorBase.replace(/\/+$/, '');
  const revision = spec.revision ?? 'main';
  return `${base}/${spec.hfRepo}/resolve/${revision}/${file.path}`;
}

/** 单文件的可尝试下载地址（主地址 + 备用地址；HF 文件只返回镜像地址） */
export function modelFileUrls(
  spec: VoiceModelSpec,
  file: VoiceModelFile,
  mirrorBase: string = HF_MIRROR_BASE,
): string[] {
  if (file.url) return [file.url, ...(file.fallbackUrls ?? [])];
  return [modelFileUrl(spec, file, mirrorBase)];
}

export type VoiceModelFileIssueKind = 'missing' | 'sizeMismatch' | 'hashMismatch';

export interface VoiceModelFileIssues {
  missing: string[];
  sizeMismatch: string[];
  hashMismatch: string[];
}

/**
 * 结构化校验：缺失 / 大小不符 / 哈希不符。
 * hash 可选：状态轮询只传 stat（快）；下载完成后可传 hash（准）。
 */
export async function findFileIssues(
  spec: VoiceModelSpec,
  stat: (relPath: string) => Promise<number | null>,
  hash?: (relPath: string) => Promise<string | null>,
): Promise<VoiceModelFileIssues> {
  const issues: VoiceModelFileIssues = { missing: [], sizeMismatch: [], hashMismatch: [] };
  for (const file of spec.files) {
    const size = await stat(file.path);
    if (size === null) {
      issues.missing.push(file.path);
      continue;
    }
    if (file.size > 0 && size !== file.size) {
      issues.sizeMismatch.push(file.path);
      continue;
    }
    if (file.sha256 && hash) {
      const actual = await hash(file.path);
      if (!actual || actual.toLowerCase() !== file.sha256.toLowerCase()) {
        issues.hashMismatch.push(file.path);
      }
    }
  }
  return issues;
}

/** 兼容旧调用：只返回缺失/大小不符的路径（状态轮询用）。 */
export async function findMissingFiles(
  spec: VoiceModelSpec,
  stat: (relPath: string) => Promise<number | null>,
): Promise<string[]> {
  const issues = await findFileIssues(spec, stat);
  const flagged = new Set([...issues.missing, ...issues.sizeMismatch]);
  return spec.files.filter((file) => flagged.has(file.path)).map((file) => file.path);
}
