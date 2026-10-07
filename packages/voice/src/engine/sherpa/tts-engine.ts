import path from 'node:path';
import type { TtsEngine, TtsEngineConfig, TtsResult, TtsSynthOptions } from '../types';
import { VoiceEngineError } from '../types';
import type { VoiceModelSpec } from '../../models/manifest';

const RULE_FSTS = ['number.fst', 'phone.fst', 'date.fst', 'new_heteronym.fst'] as const;
const KOKORO_ZH_FSTS = ['date-zh.fst', 'number-zh.fst', 'phone-zh.fst'] as const;
const MELO_MODEL_FILE = 'model.onnx';
const KOKORO_MODEL_FILE = 'model.onnx';

/**
 * sherpa-onnx 绑定的最小结构面（仅声明用到的成员）。
 * 真正的类型来自 sherpa-onnx-node（无 .d.ts），这里结构性声明避免引第三方 any。
 */
export interface SherpaTtsNative {
  sampleRate: number;
  numSpeakers: number;
  generate(req: {
    text: string;
    sid: number;
    speed: number;
  }): { samples: Float32Array; sampleRate: number };
  free?(): void;
}

export interface SherpaTtsModule {
  OfflineTts: new (config: unknown) => SherpaTtsNative;
}

/** 可注入的模块加载器（生产用动态 import，测试传 mock） */
export type SherpaTtsLoader = () => Promise<SherpaTtsModule>;

/** 默认加载器：动态 require 风格的 CJS 包（sherpa-onnx-node 是 CJS） */
export const defaultSherpaTtsLoader: SherpaTtsLoader = async () =>
  (await import('sherpa-onnx-node' as string)) as unknown as SherpaTtsModule;

export interface SherpaTtsOptions {
  config: TtsEngineConfig;
  spec: VoiceModelSpec;
  /** 启用哪些规则 fst（MeloTTS 中文四件套）；缺省全开（存在才拼） */
  ruleFsts?: readonly string[];
  loader?: SherpaTtsLoader;
  /** 文件存在性检查（生产 fs.existsSync，测试注入） */
  exists?: (p: string) => boolean;
}

/**
 * sherpa-onnx VITS（MeloTTS zh_en）离线 TTS 引擎。
 *
 * 构造时即加载模型（耗时操作），调用方应把实例长驻复用；
 * 配置变化（sid/速度除外，速度是每次合成参数）时 dispose 后重建。
 */
export class SherpaTtsEngine implements TtsEngine {
  private readonly native: SherpaTtsNative;
  private readonly speakerId: number;
  private readonly speakerCount: number;
  private readonly defaultSpeed: number;

  private constructor(
    native: SherpaTtsNative,
    speakerId: number,
    speed: number,
    speakerCount: number,
  ) {
    this.native = native;
    this.speakerId = speakerId;
    this.defaultSpeed = speed;
    this.speakerCount = speakerCount;
  }

  static async create(options: SherpaTtsOptions): Promise<SherpaTtsEngine> {
    const { config, spec, loader = defaultSherpaTtsLoader, exists } = options;
    const fsExists =
      exists ?? ((p: string) => existsSyncSafe(p));
    const modelDir = config.modelDir;
    const isKokoro = Boolean(config.kokoro);

    const required = isKokoro
      ? [
          KOKORO_MODEL_FILE,
          'tokens.txt',
          'voices.bin',
          path.join('espeak-ng-data', 'phontab'),
          'lexicon-zh.txt',
        ]
      : [MELO_MODEL_FILE, 'tokens.txt', 'lexicon.txt'];
    for (const rel of required) {
      if (!fsExists(path.join(modelDir, rel))) {
        throw new VoiceEngineError(
          'tts',
          `模型文件缺失：${rel}`,
          `请在语音设置中下载「${spec.label}」或检查模型目录`,
        );
      }
    }

    const meloFsts = (options.ruleFsts ?? RULE_FSTS)
      .map((f) => path.join(modelDir, f))
      .filter((f) => fsExists(f))
      .join(',');
    const dictDir = fsExists(path.join(modelDir, 'dict')) ? path.join(modelDir, 'dict') : '';

    let mod: SherpaTtsModule;
    try {
      mod = await loader();
    } catch (error) {
      throw new VoiceEngineError(
        'tts',
        `sherpa-onnx-node 加载失败：${(error as Error).message}`,
        '检查依赖是否安装完整（含平台包 sherpa-onnx-win-x64）',
      );
    }

    // Kokoro：model.kokoro（多说话人，voices.bin + espeak 数据 + 中英词典）；
    // MeloTTS：model.vits（单说话人，jieba dict 内联配置）。
    const modelConfig = isKokoro
      ? {
          kokoro: {
            model: path.join(modelDir, KOKORO_MODEL_FILE),
            voices: config.kokoro!.voices,
            tokens: path.join(modelDir, 'tokens.txt'),
            dataDir: config.kokoro!.dataDir,
            lexicon: config.kokoro!.lexicon,
          },
        }
      : {
          vits: {
            model: path.join(modelDir, MELO_MODEL_FILE),
            lexicon: path.join(modelDir, 'lexicon.txt'),
            tokens: path.join(modelDir, 'tokens.txt'),
            dataDir: '',
            dictDir,
          },
        };

    const kokoroFsts = isKokoro
      ? (config.kokoro?.ruleFsts ??
          KOKORO_ZH_FSTS.map((f) => path.join(modelDir, f))
            .filter((f) => fsExists(f))
            .join(','))
      : '';
    const ruleFsts = isKokoro ? kokoroFsts : meloFsts;

    let native: SherpaTtsNative;
    try {
      native = new mod.OfflineTts({
        model: modelConfig,
        numThreads: config.numThreads ?? 4,
        debug: false,
        provider: config.provider ?? 'cpu',
        // Kokoro 前端强制 max_num_sentences=1（传 2 会被原生层忽略并逐次刷警告）
        maxNumSentences: isKokoro ? 1 : 2,
        ...(ruleFsts ? { ruleFsts } : {}),
      });
    } catch (error) {
      throw new VoiceEngineError('tts', `引擎初始化失败：${(error as Error).message}`);
    }

    const speakerCount = native.numSpeakers;
    const requested = config.speakerId ?? 0;
    const speakerId = requested < speakerCount ? requested : 0;
    if (requested !== speakerId) {
      // 不打断使用：sid 超出模型说话人数时回落到 0 并记录
      console.warn(
        `[voice:tts] 请求 sid=${requested} 超出模型说话人数 ${speakerCount}，回落 sid=0`,
      );
    }
    return new SherpaTtsEngine(native, speakerId, config.speed ?? 1, speakerCount);
  }

  async synthesize(text: string, opts?: TtsSynthOptions): Promise<TtsResult> {
    const trimmed = text.trim();
    if (!trimmed) return { samples: new Float32Array(0), sampleRate: this.native.sampleRate };
    // 逐句 sid：多说话人模型按角色配音；未指定则用引擎默认
    const requested = opts?.speakerId ?? this.speakerId;
    const sid = requested < this.speakerCount ? requested : this.speakerId;
    const audio = this.native.generate({
      text: trimmed,
      sid,
      speed: this.defaultSpeed,
    });
    return { samples: audio.samples, sampleRate: audio.sampleRate ?? this.native.sampleRate };
  }

  async dispose(): Promise<void> {
    try {
      this.native.free?.();
    } catch {
      /* best-effort */
    }
  }
}

/** 不引 node:fs 到热路径类型里的小包装（保持单文件 ≤300 行与测试可注入） */
function existsSyncSafe(p: string): boolean {
  // 延迟 require，避免本模块在浏览器侧被误打包时直接炸
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  return fs.existsSync(p);
}
