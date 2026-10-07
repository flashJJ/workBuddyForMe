import path from 'node:path';
import type { AsrEngine, AsrEngineConfig, AsrResult } from '../types';
import { VoiceEngineError } from '../types';
import type { VoiceModelSpec } from '../../models/manifest';
import { ASR_SAMPLE_RATE } from '../../audio/wav-codec';

/** sherpa-onnx Node 绑定的最小结构面（结构性声明，不引第三方 any） */
export interface SherpaAsrStream {
  acceptWaveform(input: { sampleRate: number; samples: Float32Array }): void;
}

export interface SherpaAsrRecognizer {
  createStream(): SherpaAsrStream;
  decode(stream: SherpaAsrStream): void;
  getResult(stream: SherpaAsrStream): { text?: string; lang?: string };
  free?(): void;
}

export interface SherpaAsrModule {
  OfflineRecognizer: new (config: unknown) => SherpaAsrRecognizer;
}

export type SherpaAsrLoader = () => Promise<SherpaAsrModule>;

export const defaultSherpaAsrLoader: SherpaAsrLoader = async () =>
  (await import('sherpa-onnx-node' as string)) as unknown as SherpaAsrModule;

export interface SherpaAsrOptions {
  config: AsrEngineConfig;
  spec: VoiceModelSpec;
  /** 逆文本归一化（数字/日期转阿拉伯数字，中文场景建议开） */
  useItn?: boolean;
  loader?: SherpaAsrLoader;
  exists?: (p: string) => boolean;
}

/**
 * sherpa-onnx SenseVoice 离线 ASR 引擎。
 * 输入必须是 16kHz 单声道 PCM（调用方/录音端负责重采样）。
 */
export class SherpaAsrEngine implements AsrEngine {
  private constructor(
    private readonly recognizer: SherpaAsrRecognizer,
    private readonly sampleRate: number,
  ) {}

  static async create(options: SherpaAsrOptions): Promise<SherpaAsrEngine> {
    const { config, spec, loader = defaultSherpaAsrLoader, exists } = options;
    const fsExists = exists ?? ((p: string) => existsSyncSafe(p));
    const modelDir = config.modelDir;

    const required = ['model.int8.onnx', 'tokens.txt'];
    for (const rel of required) {
      if (!fsExists(path.join(modelDir, rel))) {
        throw new VoiceEngineError(
          'asr',
          `模型文件缺失：${rel}`,
          `请在语音设置中下载「${spec.label}」或检查模型目录`,
        );
      }
    }

    let mod: SherpaAsrModule;
    try {
      mod = await loader();
    } catch (error) {
      throw new VoiceEngineError(
        'asr',
        `sherpa-onnx-node 加载失败：${(error as Error).message}`,
        '检查依赖是否安装完整（含平台包 sherpa-onnx-win-x64）',
      );
    }

    let recognizer: SherpaAsrRecognizer;
    try {
      recognizer = new mod.OfflineRecognizer({
        modelConfig: {
          senseVoice: {
            model: path.join(modelDir, 'model.int8.onnx'),
            language: '',
            useInverseTextNormalization: options.useItn === false ? 0 : 1,
          },
          tokens: path.join(modelDir, 'tokens.txt'),
          numThreads: config.numThreads ?? 4,
          debug: false,
          provider: config.provider ?? 'cpu',
        },
      });
    } catch (error) {
      throw new VoiceEngineError('asr', `引擎初始化失败：${(error as Error).message}`);
    }

    return new SherpaAsrEngine(recognizer, ASR_SAMPLE_RATE);
  }

  async transcribe(samples: Float32Array): Promise<AsrResult> {
    if (samples.length === 0) return { text: '', lang: null };
    const stream = this.recognizer.createStream();
    stream.acceptWaveform({ sampleRate: this.sampleRate, samples });
    this.recognizer.decode(stream);
    const result = this.recognizer.getResult(stream);
    // SenseVoice 的 lang 形如 "<|zh|>"，归一化为纯语言码
    const rawLang = typeof result.lang === 'string' ? result.lang.trim() : '';
    const matched = /^<\|([a-z-]+)\|>$/i.exec(rawLang)?.[1]?.toLowerCase();
    const lang = matched ?? (rawLang ? rawLang : null);
    return { text: (result.text ?? '').trim(), lang };
  }

  async dispose(): Promise<void> {
    try {
      this.recognizer.free?.();
    } catch {
      /* best-effort */
    }
  }
}

function existsSyncSafe(p: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  return fs.existsSync(p);
}
