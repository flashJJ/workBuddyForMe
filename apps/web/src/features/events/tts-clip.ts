/**
 * v1.7 事件台词 → 语音帧适配（纯函数，无 DOM/网络）。
 *
 * /api/voice/tts 返回整段 PCM16 WAV；事件 speech 复用 v1.6 单一
 * AudioPlaybackQueue（不新开音频通道），需把 WAV 字节转成 voice_audio 帧：
 * base64 载荷 + 从 WAV 头解析采样率 + final=true（单段剪辑即一轮）。
 */
import type { VoiceAudioFrame } from '@/features/voice/audio-playback-queue';

/** WAV（PCM）RIFF 头固定布局：采样率在偏移 24 的小端 uint32 */
const WAV_SAMPLE_RATE_OFFSET = 24;
const WAV_MIN_BYTES = 44;

/** 分块编码，避免 String.fromCharCode(...large) 撑爆参数栈 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * WAV ArrayBuffer → 可直接 enqueue 的 voice_audio 帧。
 * 非法/过短缓冲返回 null（调用方静默降级纯气泡，不打断剧本）。
 */
export function wavToVoiceFrame(buffer: ArrayBuffer, fragment: string): VoiceAudioFrame | null {
  if (!buffer || buffer.byteLength < WAV_MIN_BYTES) return null;
  const bytes = new Uint8Array(buffer);
  const riff = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  const wave = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  if (riff !== 'RIFF' || wave !== 'WAVE') return null;
  const view = new DataView(buffer);
  const sampleRate = view.getUint32(WAV_SAMPLE_RATE_OFFSET, true);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return null;
  return {
    fragment,
    spoken: fragment,
    audio: bytesToBase64(bytes),
    sampleRate,
    final: true,
  };
}
