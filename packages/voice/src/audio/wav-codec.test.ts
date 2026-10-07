import { describe, expect, it } from 'vitest';
import { decodePcm16Wav, encodePcm16Wav, resampleLinear, ASR_SAMPLE_RATE } from './wav-codec';

describe('encodePcm16Wav / decodePcm16Wav', () => {
  it('写入标准 RIFF/WAVE 头并标记为 16k 单声道', () => {
    const buf = encodePcm16Wav(new Float32Array([0, 0.5, -0.5]), ASR_SAMPLE_RATE);
    expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
    expect(buf.toString('ascii', 8, 12)).toBe('WAVE');
    expect(buf.readUInt16LE(22)).toBe(1); // channels
    expect(buf.readUInt32LE(24)).toBe(16000); // sample rate
    expect(buf.readUInt16LE(34)).toBe(16); // bits
    expect(buf.readUInt32LE(40)).toBe(3 * 2); // data size
  });

  it('往返编解码保持采样值在量化误差内', () => {
    const src = new Float32Array([0, 0.1, -0.1, 0.99, -0.99, 1, -1]);
    const wav = encodePcm16Wav(src, 16000);
    const { samples, sampleRate, channels } = decodePcm16Wav(wav);
    expect(sampleRate).toBe(16000);
    expect(channels).toBe(1);
    expect(samples.length).toBe(src.length);
    // 16bit 量化误差 < 1/32768
    src.forEach((v, i) => expect(Math.abs((samples[i] ?? 0) - v)).toBeLessThan(3.1e-5));
  });

  it('饱和裁剪：超出 [-1,1] 的值不回绕', () => {
    const wav = encodePcm16Wav(new Float32Array([2, -2]), 16000);
    const { samples } = decodePcm16Wav(wav);
    expect(samples[0]).toBeCloseTo(1, 3);
    expect(samples[1]).toBeCloseTo(-1, 3);
  });

  it('拒绝非 WAV 缓冲', () => {
    expect(() => decodePcm16Wav(Buffer.from('not a wav file at all!!'))).toThrow(/RIFF/);
  });
});

describe('resampleLinear', () => {
  it('同采样率直接返回原数组', () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    expect(resampleLinear(input, 16000, 16000)).toBe(input);
  });

  it('48k → 16k 长度变为 1/3 且首末值对齐', () => {
    const input = new Float32Array([1, 0, 0, 0.5, 0, 0, -0.5, 0, 0]);
    const out = resampleLinear(input, 48000, 16000);
    expect(out.length).toBe(3);
    expect(out[0]).toBe(1);
    expect(out[2]).toBeCloseTo(-0.5, 4);
  });
});
