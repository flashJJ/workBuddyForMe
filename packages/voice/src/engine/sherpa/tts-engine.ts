import type { TtsEngine, TtsEngineConfig, TtsResult, TtsSynthOptions } from '../types';
import { VoiceEngineError } from '../types';
import type { VoiceModelSpec } from '../../models/manifest';
import { isSpeakableText } from '../../text/sentence-splitter';
import { buildNativeTtsConfig, type BuiltNativeTtsConfig } from './tts-native-config';

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
 * 按配置构造原生 OfflineTts；inline 与 worker 两条路径共用（含文件校验与 sid 回落）。
 * 返回的实例由调用方决定挂在主线程还是 worker 线程。
 */
export function createNativeTts(
  built: BuiltNativeTtsConfig,
  mod: SherpaTtsModule,
): SherpaTtsNative {
  try {
    return new mod.OfflineTts(built.nativeConfig);
  } catch (error) {
    throw new VoiceEngineError('tts', `引擎初始化失败：${(error as Error).message}`);
  }
}

/**
 * sherpa-onnx VITS（MeloTTS zh_en / Kokoro）离线 TTS 引擎，**在主线程同步跑原生推理**。
 *
 * 构造时即加载模型（耗时操作），调用方应把实例长驻复用；
 * 配置变化（sid/速度除外，速度是每次合成参数）时 dispose 后重建。
 *
 * 注意：原生生成是同步调用，运行期间会占住调用线程。对话场景请用
 * WorkerTtsEngine（见 tts-worker）避免阻塞 SSE 与模型流；本类保留作为
 * worker 不可用时的回退与单元测试基线。
 */
export class SherpaTtsEngine implements TtsEngine {
  private readonly native: SherpaTtsNative;
  private readonly speakerId: number;
  private readonly speakerCount: number;
  private readonly speed: number;

  private constructor(
    native: SherpaTtsNative,
    speakerId: number,
    speed: number,
    speakerCount: number,
  ) {
    this.native = native;
    this.speakerId = speakerId;
    this.speed = speed;
    this.speakerCount = speakerCount;
  }

  static async create(options: SherpaTtsOptions): Promise<SherpaTtsEngine> {
    const { config, spec, loader = defaultSherpaTtsLoader, exists } = options;
    const fsExists = exists ?? ((p: string) => existsSyncSafe(p));
    const built = buildNativeTtsConfig({ config, spec, ruleFsts: options.ruleFsts, exists: fsExists });

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

    const native = createNativeTts(built, mod);
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
    // 空串或纯标点/表情：直接返回空音频，绝不交给原生层。
    // 实测 MeloTTS 对「：）」这类片段会报 Failed to convert … to token IDs 并终止进程。
    if (!trimmed || !isSpeakableText(trimmed)) {
      return { samples: new Float32Array(0), sampleRate: this.native.sampleRate };
    }
    // 逐句 sid：多说话人模型按角色配音；未指定则用引擎默认
    const requested = opts?.speakerId ?? this.speakerId;
    const sid = requested < this.speakerCount ? requested : this.speakerId;
    const audio = this.native.generate({
      text: trimmed,
      sid,
      speed: this.speed,
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
