import { describe, expect, it } from 'vitest';
import { downsampleTo16k, encodeWav16k, rms, TARGET_SAMPLE_RATE } from './pcm-wav';

describe('downsampleTo16k', () => {
  it('16k 原样返回', () => {
    const input = new Float32Array([0.1, 0.2]);
    expect(downsampleTo16k(input, 16000)).toBe(input);
  });

  it('48k → 16k 长度为 1/3', () => {
    const input = new Float32Array(48).fill(0.5);
    const out = downsampleTo16k(input, 48000);
    expect(out.length).toBe(16);
    expect(out[0]).toBeCloseTo(0.5, 5);
  });

  it('44.1k → 16k 线性插值', () => {
    const input = new Float32Array(441).map((_, i) => (i % 2 === 0 ? 1 : -1));
    const out = downsampleTo16k(input, 44100);
    expect(out.length).toBe(160);
    expect(Math.abs(out[0]!)).toBeLessThanOrEqual(1);
  });
});

describe('encodeWav16k', () => {
  it('写出合法 RIFF/WAVE 头与 16k 单声道参数', () => {
    const buf = encodeWav16k(new Float32Array([0, 0.5, -0.5]));
    const view = new DataView(buf);
    const text = (off: number, n: number) =>
      String.fromCharCode(...Array.from({ length: n }, (_, i) => view.getUint8(off + i)));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(TARGET_SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
  });
});

describe('rms', () => {
  it('空数组为 0，满幅为 1', () => {
    expect(rms(new Float32Array(0))).toBe(0);
    expect(rms(new Float32Array([1, -1, 1, -1]))).toBeCloseTo(1, 5);
  });
});
