import { randomUUID } from 'node:crypto';
import { MPEGDecoder } from 'mpg123-decoder';
import {
  chunkForTts,
  VoiceEngineError,
  type TtsEngine,
  type TtsResult,
  type TtsSynthOptions,
} from '@wbfm/voice';
import {
  EDGE_SEC_MS_GEC_VERSION,
  EDGE_TRUSTED_CLIENT_TOKEN,
  generateEdgeSecMsGec,
} from './edge-tts-token';

const WSS_ENDPOINT =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
/** Edge Read Aloud 只接受 MP3 / WebM / Ogg；这里用 MP3 再由 mpg123 WASM 解码成 PCM */
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const FALLBACK_SAMPLE_RATE = 24_000;
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
  decodeMp3?: EdgeMp3Decode;
}

/**
 * 微软 Edge 在线朗读引擎（免密钥）。
 *
 * - 每个文本片段建立一条 WSS 连接，按官方协议发 speech.config + SSML；
 * - 音频以 MP3 分片返回，用 mpg123 WASM 解为 24kHz 单声道 float32；
 * - 失败一律抛 VoiceEngineError，由 VoiceRuntime 回退本地引擎。
 */
export class EdgeTtsEngine implements TtsEngine {
  private readonly voice: string;
  private readonly speed: number;
  private readonly timeoutMs: number;
  private readonly socketFactory: EdgeSocketFactory;
  private readonly decodeMp3: EdgeMp3Decode;

  constructor(options: EdgeTtsEngineOptions = {}) {
    this.voice = options.voice?.trim() || 'zh-CN-XiaoxiaoNeural';
    this.speed = options.speed ?? 1;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.socketFactory = options.socketFactory ?? createSocket;
    this.decodeMp3 = options.decodeMp3 ?? decodeMp3ToPcm;
  }

  async synthesize(text: string, opts?: TtsSynthOptions): Promise<TtsResult> {
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
      const result = await this.request(part, speed, opts?.signal);
      sampleRate = result.sampleRate;
      chunks.push(result.samples);
    }
    return { samples: concatSamples(chunks), sampleRate };
  }

  async dispose(): Promise<void> {
    /* 每句连接用完即关，无长驻资源 */
  }

  private async request(text: string, speed: number, signal?: AbortSignal): Promise<TtsResult> {
    if (signal?.aborted) {
      throw new VoiceEngineError('tts', '合成已取消');
    }
    const socket = await this.socketFactory(this.buildUrl());
    return new Promise<TtsResult>((resolve, reject) => {
      const audio: Buffer[] = [];
      let settled = false;

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
        if (error) reject(error);
      };

      const fail = (message: string, hint?: string) => {
        if (settled) return;
        const error = new VoiceEngineError('tts', message, hint);
        finish(error);
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
          if (parsePath(data.toString()) === 'turn.end') {
            const mp3 = Buffer.concat(audio);
            finish();
            if (mp3.length === 0) {
              reject(
                new VoiceEngineError('tts', '微软在线朗读未返回音频', '检查网络或稍后重试'),
              );
              return;
            }
            this.decodeMp3(new Uint8Array(mp3)).then(resolve, (error: Error) => {
              reject(new VoiceEngineError('tts', `微软在线朗读解码失败：${error.message}`));
            });
          }
          return;
        }
        const chunk = extractAudioChunk(data);
        if (chunk) audio.push(chunk);
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

function buildConfigMessage(): string {
  const payload = JSON.stringify({
    context: {
      synthesis: {
        audio: {
          metadataoptions: {
            sentenceBoundaryEnabled: 'false',
            wordBoundaryEnabled: 'false',
          },
          outputFormat: OUTPUT_FORMAT,
        },
      },
    },
  });
  return `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${payload}`;
}

function buildSsmlMessage(text: string, voice: string, speed: number): string {
  const percent = Math.round((speed - 1) * 100);
  const rate = `${percent >= 0 ? '+' : ''}${percent}%`;
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
    `<voice name='${escapeXml(voice)}'><prosody pitch='+0Hz' rate='${rate}' volume='+0%'>` +
    `${escapeXml(text)}</prosody></voice></speak>`;
  return `X-RequestId:${randomUUID().replace(/-/g, '')}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\n\r\n${ssml}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function parsePath(text: string): string | null {
  const match = /(?:^|\r\n)Path:([^\r\n]+)/.exec(text);
  return match?.[1]?.trim() ?? null;
}

/** 二进制帧：2 字节大端头长度 + 文本头（含 Path:audio）+ 音频负载 */
function extractAudioChunk(frame: Buffer): Buffer | null {
  if (frame.length < 2) return null;
  const headerLength = frame.readUInt16BE(0);
  if (frame.length < 2 + headerLength) return null;
  const header = frame.subarray(2, 2 + headerLength).toString('utf8');
  if (!header.includes('Path:audio')) return null;
  const payload = frame.subarray(2 + headerLength);
  return payload.length > 0 ? payload : null;
}

async function decodeMp3ToPcm(mp3: Uint8Array): Promise<TtsResult> {
  const decoder = new MPEGDecoder();
  await decoder.ready;
  try {
    const decoded = decoder.decode(mp3);
    const mono =
      decoded.channelData[0] && decoded.channelData[0].length > 0
        ? decoded.channelData[0]
        : decoded.channelData[1];
    if (!mono || mono.length === 0) {
      throw new Error('解码结果为空');
    }
    return { samples: mono, sampleRate: decoded.sampleRate || FALLBACK_SAMPLE_RATE };
  } finally {
    decoder.free();
  }
}

function concatSamples(chunks: Float32Array[]): Float32Array {
  if (chunks.length === 0) return new Float32Array(0);
  if (chunks.length === 1) return chunks[0]!;
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}
