import { describe, expect, it } from 'vitest';
import { wavToVoiceFrame } from './tts-clip';

/** 构造最小合法 PCM WAV：RIFF/WAVE 头 + 偏移 24 的小端采样率 */
function makeWav(sampleRate: number, extraBytes = 16): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + extraBytes);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  bytes.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
  view.setUint32(24, sampleRate, true);
  for (let i = 44; i < bytes.length; i += 1) bytes[i] = (i * 7) & 0xff;
  return buffer;
}

describe('wavToVoiceFrame', () => {
  it('合法 WAV：解析采样率、base64 载荷可还原、final 单段帧', () => {
    const source = makeWav(22050);
    const frame = wavToVoiceFrame(source, '早上好');
    expect(frame).not.toBeNull();
    expect(frame!.sampleRate).toBe(22050);
    expect(frame!.final).toBe(true);
    expect(frame!.fragment).toBe('早上好');
    expect(frame!.spoken).toBe('早上好');
    expect(frame!.audio).toBeTruthy();

    const restored = Uint8Array.from(atob(frame!.audio!), (c) => c.charCodeAt(0));
    expect(restored.length).toBe(source.byteLength);
    expect(restored[0]).toBe(0x52);
    expect(restored[43]).toBe(new Uint8Array(source)[43]);
    expect(restored.at(-1)).toBe(new Uint8Array(source).at(-1));
  });

  it('过短缓冲返回 null（静默降级纯气泡）', () => {
    expect(wavToVoiceFrame(new ArrayBuffer(12), 'x')).toBeNull();
  });

  it('RIFF/WAVE 魔数不匹配返回 null', () => {
    const bad = makeWav(16000);
    new Uint8Array(bad)[0] = 0x00;
    expect(wavToVoiceFrame(bad, 'x')).toBeNull();
  });

  it('采样率为 0 返回 null', () => {
    expect(wavToVoiceFrame(makeWav(0), 'x')).toBeNull();
  });
});
