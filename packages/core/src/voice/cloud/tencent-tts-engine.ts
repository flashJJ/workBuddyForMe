import { createHash, createHmac, randomUUID } from 'node:crypto';
import { chunkForTts, VoiceEngineError, type TtsEngine, type TtsResult, type TtsSynthOptions } from '@wbfm/voice';

const HOST = 'tts.tencentcloudapi.com';
const SERVICE = 'tts';
const ACTION = 'TextToVoice';
const VERSION = '2019-08-23';
const DEFAULT_REGION = 'ap-guangzhou';
const DEFAULT_VOICE_TYPE = 101001;
/** 单次请求文本上限（中文 150 字；英文 500 字母，取保守值） */
const MAX_TEXT = 150;

export interface TencentTtsEngineOptions {
  secretId: string;
  secretKey: string;
  region?: string;
  voiceType?: number;
  modelType?: number;
  sampleRate?: 8000 | 16000 | 24000;
  /** 默认语速（应用侧 1.0 = 正常） */
  speed?: number;
  /** 注入 fetch（测试用） */
  fetchImpl?: typeof fetch;
  /** 单次请求超时，默认 15s */
  timeoutMs?: number;
}

interface TencentResponse {
  Response?: {
    Audio?: string;
    Error?: { Code?: string; Message?: string };
    RequestId?: string;
  };
}

/**
 * 腾讯云在线 TTS（通用语音合成 TextToVoice，PCM 直出）。
 *
 * - 每句一次 HTTPS 请求，Codec=pcm 避免服务端引入 MP3 解码依赖；
 * - 语速按官方档位（0.6/0.8/1.0/1.2/1.5/2.5）线性插值；
 * - 失败抛 VoiceEngineError，由 VoiceRuntime 回退本地引擎。
 */
export class TencentTtsEngine implements TtsEngine {
  private readonly secretId: string;
  private readonly secretKey: string;
  private readonly region: string;
  private readonly voiceType: number;
  private readonly modelType: number;
  private readonly sampleRate: 8000 | 16000 | 24000;
  private readonly speed: number;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: TencentTtsEngineOptions) {
    this.secretId = options.secretId;
    this.secretKey = options.secretKey;
    this.region = options.region?.trim() || DEFAULT_REGION;
    this.voiceType = options.voiceType ?? DEFAULT_VOICE_TYPE;
    this.modelType = options.modelType ?? 1;
    this.sampleRate = options.sampleRate ?? 16000;
    this.speed = options.speed ?? 1;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async synthesize(text: string, opts?: TtsSynthOptions): Promise<TtsResult> {
    const trimmed = text.trim();
    if (!trimmed) return { samples: new Float32Array(0), sampleRate: this.sampleRate };
    const parts = chunkForTts(trimmed, MAX_TEXT);
    if (parts.length === 0) {
      return { samples: new Float32Array(0), sampleRate: this.sampleRate };
    }
    const chunks: Float32Array[] = [];
    for (const part of parts) {
      if (opts?.signal?.aborted) throw new VoiceEngineError('tts', '合成已取消');
      chunks.push(await this.request(part, opts?.signal));
    }
    return { samples: concatChunks(chunks), sampleRate: this.sampleRate };
  }

  async dispose(): Promise<void> {
    /* 无长驻资源 */
  }

  private async request(text: string, signal?: AbortSignal): Promise<Float32Array> {
    const body = JSON.stringify({
      Text: text,
      SessionId: randomUUID(),
      VoiceType: this.voiceType,
      ModelType: this.modelType,
      Speed: mapTencentSpeed(this.speed),
      Volume: 0,
      PrimaryLanguage: 1,
      SampleRate: this.sampleRate,
      Codec: 'pcm',
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const authorization = buildTencentAuthorization({
      secretId: this.secretId,
      secretKey: this.secretKey,
      timestamp,
      body,
      host: HOST,
      service: SERVICE,
    });
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await this.fetchImpl(`https://${HOST}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization,
          'x-tc-action': ACTION,
          'x-tc-version': VERSION,
          'x-tc-timestamp': String(timestamp),
          'x-tc-region': this.region,
        },
        body,
        signal: combined,
      });
    } catch (error) {
      if (signal?.aborted) throw new VoiceEngineError('tts', '合成已取消');
      throw new VoiceEngineError(
        'tts',
        `腾讯云 TTS 请求失败：${(error as Error).message}`,
        '检查网络与腾讯云语音合成服务是否已开通',
      );
    }
    const payload = (await response.json().catch(() => null)) as TencentResponse | null;
    const apiError = payload?.Response?.Error;
    if (!response.ok || apiError) {
      const detail = apiError ? `${apiError.Code ?? 'Error'}: ${apiError.Message ?? ''}` : `HTTP ${response.status}`;
      throw new VoiceEngineError('tts', `腾讯云 TTS 合成失败（${detail}）`, '检查密钥/音色/免费额度是否有效');
    }
    const audio = payload?.Response?.Audio;
    if (!audio) {
      throw new VoiceEngineError('tts', '腾讯云 TTS 未返回音频', '检查音色 ID 与采样率是否匹配');
    }
    return decodePcm16(Buffer.from(audio, 'base64'));
  }
}

/** TC3-HMAC-SHA256 签名（与腾讯云 API 3.0 文档一致） */
export function buildTencentAuthorization(input: {
  secretId: string;
  secretKey: string;
  timestamp: number;
  body: string;
  host?: string;
  service?: string;
}): string {
  const host = input.host ?? HOST;
  const service = input.service ?? SERVICE;
  const date = new Date(input.timestamp * 1000).toISOString().slice(0, 10);
  const signedHeaders = 'content-type;host';
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    sha256Hex(input.body),
  ].join('\n');
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(input.timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const secretDate = hmac(`TC3${input.secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, 'tc3_request');
  const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
  return `TC3-HMAC-SHA256 Credential=${input.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/** 应用侧语速（1.0 正常）→ 腾讯云 [-2,6] 档位（官方档位间线性插值） */
export function mapTencentSpeed(speed: number): number {
  const points: Array<[number, number]> = [
    [0.6, -2],
    [0.8, -1],
    [1, 0],
    [1.2, 1],
    [1.5, 2],
    [2.5, 6],
  ];
  if (speed <= points[0]![0]) return points[0]![1];
  if (speed >= points[points.length - 1]![0]) return points[points.length - 1]![1];
  for (let i = 1; i < points.length; i += 1) {
    const [s0, t0] = points[i - 1]!;
    const [s1, t1] = points[i]!;
    if (speed <= s1) {
      const value = t0 + ((speed - s0) / (s1 - s0)) * (t1 - t0);
      return Math.round(value * 100) / 100;
    }
  }
  return 0;
}

/** PCM16LE mono → float32 [-1,1] */
export function decodePcm16(buffer: Buffer): Float32Array {
  const samples = new Float32Array(Math.floor(buffer.length / 2));
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = buffer.readInt16LE(i * 2) / 32768;
  }
  return samples;
}

function concatChunks(chunks: Float32Array[]): Float32Array {
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

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}
