/**
 * 最小 WAV (PCM16) 编解码：浏览器录音 ↔ 引擎/网络传输之间的桥。
 * 不引入第三方音频库；仅支持 v1 实际使用的单声道 PCM16。
 */

const WAV_HEADER_SIZE = 44;

export interface DecodedWav {
  samples: Float32Array;
  sampleRate: number;
  channels: number;
}

/** 将 float32 PCM 编码为单声道 16-bit PCM WAV（含 44 字节标准头）。 */
export function encodePcm16Wav(samples: Float32Array, sampleRate: number): Buffer {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(WAV_HEADER_SIZE + dataSize);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // PCM fmt chunk size
  buf.writeUInt16LE(1, 20); // audioFormat = PCM
  buf.writeUInt16LE(1, 22); // channels = 1
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byteRate = sr * ch * bps/8
  buf.writeUInt16LE(2, 32); // blockAlign
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);

  let offset = WAV_HEADER_SIZE;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buf.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, offset);
    offset += 2;
  }
  return buf;
}

/**
 * 解析 WAV：仅要求 PCM（formatTag=1）。
 * 多声道按简单平均折叠为单声道（v1 录音链路本身就是单声道，此分支为健壮性）。
 */
export function decodePcm16Wav(buffer: Buffer): DecodedWav {
  if (buffer.length < WAV_HEADER_SIZE || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('invalid wav: missing RIFF header');
  }
  if (buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('invalid wav: missing WAVE marker');
  }
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  if (bitsPerSample !== 16) {
    throw new Error(`unsupported wav: ${bitsPerSample}-bit (only 16-bit PCM)`);
  }

  // 定位 data chunk（头长度可能因 LIST 等扩展 chunk 变化）
  let pos = 12;
  let dataSize = 0;
  let dataOffset = -1;
  while (pos + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', pos, pos + 4);
    const chunkSize = buffer.readUInt32LE(pos + 4);
    if (chunkId === 'data') {
      dataOffset = pos + 8;
      dataSize = chunkSize;
      break;
    }
    pos += 8 + chunkSize + (chunkSize % 2); // chunk 偶数字节对齐
  }
  if (dataOffset < 0) {
    throw new Error('invalid wav: data chunk not found');
  }

  const frameCount = Math.floor(dataSize / 2 / channels);
  const mono = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i += 1) {
    let sum = 0;
    for (let c = 0; c < channels; c += 1) {
      const int16 = buffer.readInt16LE(dataOffset + (i * channels + c) * 2);
      sum += int16 < 0 ? int16 / 0x8000 : int16 / 0x7fff;
    }
    mono[i] = sum / channels;
  }
  return { samples: mono, sampleRate, channels };
}

/**
 * 线性重采样（简单低质量方案，仅用于引擎采样率不匹配的兜底）。
 * 正式链路应在录音端直接采 16kHz，避免走这里。
 */
export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLength = Math.round(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcPos - i0;
    out[i] = (input[i0] ?? 0) * (1 - frac) + (input[i1] ?? 0) * frac;
  }
  return out;
}

export const WAV_MIME = 'audio/wav';
export const ASR_SAMPLE_RATE = 16000;
