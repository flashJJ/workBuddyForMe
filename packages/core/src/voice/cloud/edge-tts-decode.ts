import { MPEGDecoder } from 'mpg123-decoder';
import type { TtsResult } from '@wbfm/voice';

export const FALLBACK_SAMPLE_RATE = 24_000;

/** v4.20：可增量喂 MP3 分片的解码器（mpg123 内部缓存不足一帧的尾巴） */
export interface EdgeStreamDecoder {
  decode(mp3: Uint8Array): TtsResult;
  free(): void;
}

function pickMono(channelData: Float32Array[]): Float32Array {
  const first = channelData[0];
  if (first && first.length > 0) return first;
  return channelData[1] ?? new Float32Array(0);
}

/** 每个音频请求一个实例：边收边解，turn.end 后释放 */
export async function openMp3StreamDecoder(): Promise<EdgeStreamDecoder> {
  const decoder = new MPEGDecoder();
  await decoder.ready;
  let freed = false;
  return {
    decode(mp3) {
      const decoded = decoder.decode(mp3);
      return {
        samples: pickMono(decoded.channelData),
        sampleRate: decoded.sampleRate || FALLBACK_SAMPLE_RATE,
      };
    },
    free() {
      if (freed) return;
      freed = true;
      decoder.free();
    },
  };
}

/** 一次性解码（单测注入路径与不支持增量时的兜底） */
export async function decodeMp3ToPcm(mp3: Uint8Array): Promise<TtsResult> {
  const decoder = new MPEGDecoder();
  await decoder.ready;
  try {
    const decoded = decoder.decode(mp3);
    const mono = pickMono(decoded.channelData);
    if (mono.length === 0) {
      throw new Error('解码结果为空');
    }
    return { samples: mono, sampleRate: decoded.sampleRate || FALLBACK_SAMPLE_RATE };
  } finally {
    decoder.free();
  }
}

export function concatSamples(chunks: Float32Array[]): Float32Array {
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
