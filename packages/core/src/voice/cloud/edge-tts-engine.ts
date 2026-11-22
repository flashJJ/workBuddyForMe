import { randomUUID } from 'node:crypto';
import {
  chunkForTts,
  VoiceEngineError,
  type TtsChunkSink,
  type TtsEngine,
  type TtsResult,
  type TtsSynthOptions,
} from '@wbfm/voice';
import {
  EDGE_SEC_MS_GEC_VERSION,
  EDGE_TRUSTED_CLIENT_TOKEN,
  generateEdgeSecMsGec,
} from './edge-tts-token';
import {
  concatSamples,
  decodeMp3ToPcm,
  FALLBACK_SAMPLE_RATE,
  openMp3StreamDecoder,
  type EdgeStreamDecoder,
} from './edge-tts-decode';
import {
  buildConfigMessage,
  buildSsmlMessage,
  extractAudioChunk,
  parsePath,
} from './edge-tts-protocol';

const WSS_ENDPOINT =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
/** 单次请求文本上限（长句按标点切分，避免 SSML 过大） */
const MAX_TEXT = 1000;
const DEFAULT_TIMEOUT_MS = 20_000;

/** 只依赖用到的 ws 事件，便于单测注入假 socket */
export interface EdgeSocket {
  on(event: 'open', listener: () => void): void;
  on(event: 'message', listener: (data: Buffer, isBinary: boolean) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'close', listener: (code: number, reason: Buffer) => void): void;
  send(data: string): void;
  close(): void;
}

export type EdgeSocketFactory = (url: string) => EdgeSocket | Promise<EdgeSocket>;
export type EdgeMp3Decode = (mp3: Uint8Array) => Promise<TtsResult>;

export interface EdgeTtsEngineOptions {
  /** Edge 音色 ShortName（如 zh-CN-XiaoxiaoNeural） */
  voice?: string;
  /** 默认语速（1.0 正常）；逐句 opts.speed 优先 */
  speed?: number;
  timeoutMs?: number;
  /** 测试注入 */
  socketFactory?: EdgeSocketFactory;
  /** 测试注入：一次性解码（给出后不再走增量解码） */
  decodeMp3?: EdgeMp3Decode;
  /** 测试注入：增量解码器工厂；默认 mpg123 增量解码 */
  createStreamDecoder?: () => Promise<EdgeStreamDecoder>;
}

/**
 * 微软 Edge 在线朗读引擎（免密钥）。
 *
 * - 每个文本片段建立一条 WSS 连接，按官方协议发 speech.config + SSML；
 * - 音频以 MP3 分片返回，v4.20 起边收边用 mpg123 增量解码，经 sink 逐块下发；
 * - 失败一律抛 VoiceEngineError，由 VoiceRuntime 回退本地引擎。
 */
export class EdgeTtsEngine implements TtsEngine {
  private readonly voice: string;
  private readonly speed: number;
  private readonly timeoutMs: number;
  private readonly socketFactory: EdgeSocketFactory;
  private readonly decodeMp3: EdgeMp3Decode;
  private readonly createStreamDecoder: (() => Promise<EdgeStreamDecoder>) | null;

  constructor(options: EdgeTtsEngineOptions = {}) {
    this.voice = options.voice?.trim() || 'zh-CN-XiaoxiaoNeural';
    this.speed = options.speed ?? 1;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.socketFactory = options.socketFactory ?? createSocket;
    this.decodeMp3 = options.decodeMp3 ?? decodeMp3ToPcm;
    this.createStreamDecoder =
      options.createStreamDecoder ?? (options.decodeMp3 ? null : openMp3StreamDecoder);
  }

  async synthesize(text: string, opts?: TtsSynthOptions): Promise<TtsResult> {
    return this.run(text, opts);
  }

  /** v4.20：增量解码，每个音频分片解出 PCM 立即经 sink 下发 */
  async synthesizeStream(
    text: string,
    opts: TtsSynthOptions | undefined,
    sink: TtsChunkSink,
  ): Promise<TtsResult> {
    return this.run(text, opts, sink);
  }

  async dispose(): Promise<void> {
    /* 每句连接用完即关，无长驻资源 */
  }

  private async run(
    text: string,
    opts?: TtsSynthOptions,
    sink?: TtsChunkSink,
  ): Promise<TtsResult> {
    const trimmed = text.trim();
    if (!trimmed) return { samples: new Float32Array(0), sampleRate: FALLBACK_SAMPLE_RATE };
    const parts = chunkForTts(trimmed, MAX_TEXT);
    if (parts.length === 0) {
      return { samples: new Float32Array(0), sampleRate: FALLBACK_SAMPLE_RATE };
    }
    const speed = opts?.speed ?? this.speed;
    const chunks: Float32Array[] = [];
    let sampleRate = FALLBACK_SAMPLE_RATE;
    for (const part of parts) {
      if (opts?.signal?.aborted) throw new VoiceEngineError('tts', '合成已取消');
      const result = await this.request(part, speed, opts?.signal, sink);
      sampleRate = result.sampleRate;
      chunks.push(result.samples);
    }
    return { samples: concatSamples(chunks), sampleRate };
  }

  private async request(
    text: string,
    speed: number,
    signal?: AbortSignal,
    sink?: TtsChunkSink,
  ): Promise<TtsResult> {
    if (signal?.aborted) {
      throw new VoiceEngineError('tts', '合成已取消');
    }
    const socket = await this.socketFactory(this.buildUrl());
    return new Promise<TtsResult>((resolve, reject) => {
      const audio: Buffer[] = [];
      const decoded: Float32Array[] = [];
      let sampleRate = FALLBACK_SAMPLE_RATE;
      let settled = false;
      let freed = false;
      let decoderPromise: Promise<EdgeStreamDecoder> | null = null;
      let pending: Promise<void> = Promise.resolve();

      const ensureDecoder = () => {
        decoderPromise ??= this.createStreamDecoder!();
        return decoderPromise;
      };

      const freeDecoder = () => {
        if (freed || !decoderPromise) return;
        freed = true;
        void pending
          .catch(() => undefined)
          .then(async () => (await decoderPromise!.catch(() => null))?.free());
      };

      const finish = (error?: VoiceEngineError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        try {
          socket.close();
        } catch {
          /* 已关闭 */
        }
        if (error) {
          freeDecoder();
          reject(error);
        }
      };

      const fail = (message: string, hint?: string) => {
        if (settled) return;
        finish(new VoiceEngineError('tts', message, hint));
      };

      const pushDecoded = (result: TtsResult) => {
        if (result.samples.length === 0) return;
        decoded.push(result.samples);
        sampleRate = result.sampleRate || sampleRate;
        sink?.(result);
      };

      const timer = setTimeout(
        () => fail('微软在线朗读超时', '检查网络连接后重试'),
        this.timeoutMs,
      );
      const onAbort = () => fail('合成已取消');
      signal?.addEventListener('abort', onAbort, { once: true });

      socket.on('open', () => {
        try {
          socket.send(buildConfigMessage());
          socket.send(buildSsmlMessage(text, this.voice, speed));
        } catch (error) {
          fail(`微软在线朗读发送失败：${(error as Error).message}`);
        }
      });
      socket.on('message', (data, isBinary) => {
        if (settled) return;
        if (!isBinary) {
          if (parsePath(data.toString()) !== 'turn.end') return;
          if (!this.createStreamDecoder) {
            const mp3 = Buffer.concat(audio);
            finish();
            if (mp3.length === 0) {
              reject(
                new VoiceEngineError('tts', '微软在线朗读未返回音频', '检查网络或稍后重试'),
              );
              return;
            }
            this.decodeMp3(new Uint8Array(mp3)).then(
              (result) => {
                sink?.(result);
                resolve(result);
              },
              (error: Error) => {
                reject(new VoiceEngineError('tts', `微软在线朗读解码失败：${error.message}`));
              },
            );
            return;
          }
          // 增量路径：等已排队的分片解完再收尾
          void pending
            .catch(() => undefined)
            .then(() => {
              if (settled) return;
              finish();
              freeDecoder();
              if (decoded.length === 0) {
                reject(
                  new VoiceEngineError('tts', '微软在线朗读未返回音频', '检查网络或稍后重试'),
                );
                return;
              }
              resolve({ samples: concatSamples(decoded), sampleRate });
            });
          return;
        }
        const chunk = extractAudioChunk(data);
        if (!chunk) return;
        if (!this.createStreamDecoder) {
          audio.push(chunk);
          return;
        }
        pending = pending
          .then(() => ensureDecoder())
          .then((decoder) => {
            if (settled) return;
            pushDecoded(decoder.decode(new Uint8Array(chunk)));
          })
          .catch((error: Error) => {
            fail(`微软在线朗读解码失败：${error.message}`);
          });
      });
      socket.on('error', (error) => {
        fail(`微软在线朗读连接失败：${error.message}`, '检查网络连接');
      });
      socket.on('close', (code) => {
        if (!settled) fail(`微软在线朗读连接中断（${code}）`, '检查网络连接');
      });
    });
  }

  private buildUrl(): string {
    const params = new URLSearchParams({
      TrustedClientToken: EDGE_TRUSTED_CLIENT_TOKEN,
      'Sec-MS-GEC': generateEdgeSecMsGec(),
      'Sec-MS-GEC-Version': EDGE_SEC_MS_GEC_VERSION,
      ConnectionId: randomUUID().replace(/-/g, ''),
    });
    return `${WSS_ENDPOINT}?${params.toString()}`;
  }
}

async function createSocket(url: string): Promise<EdgeSocket> {
  // Next/tsup 可能把 ws 的可选原生加速依赖 bufferutil 解析为空模块，
  // 使长帧发送时报 “mask is not a function”；显式关闭该加速路径改用内置 JS mask。
  process.env.WS_NO_BUFFER_UTIL ??= '1';
  const { default: WebSocketImpl } = await import('ws');
  const socket = new WebSocketImpl(url, {
    headers: {
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
      Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
    },
  });
  return socket as unknown as EdgeSocket;
}
