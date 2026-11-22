import { randomUUID } from 'node:crypto';

/** Edge Read Aloud 只接受 MP3 / WebM / Ogg；这里用 MP3 再由 mpg123 WASM 解码成 PCM */
export const EDGE_OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

export function buildConfigMessage(): string {
  const payload = JSON.stringify({
    context: {
      synthesis: {
        audio: {
          metadataoptions: {
            sentenceBoundaryEnabled: 'false',
            wordBoundaryEnabled: 'false',
          },
          outputFormat: EDGE_OUTPUT_FORMAT,
        },
      },
    },
  });
  return `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${payload}`;
}

export function buildSsmlMessage(text: string, voice: string, speed: number): string {
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

export function parsePath(text: string): string | null {
  const match = /(?:^|\r\n)Path:([^\r\n]+)/.exec(text);
  return match?.[1]?.trim() ?? null;
}

/** 二进制帧：2 字节大端头长度 + 文本头（含 Path:audio）+ 音频负载 */
export function extractAudioChunk(frame: Buffer): Buffer | null {
  if (frame.length < 2) return null;
  const headerLength = frame.readUInt16BE(0);
  if (frame.length < 2 + headerLength) return null;
  const header = frame.subarray(2, 2 + headerLength).toString('utf8');
  if (!header.includes('Path:audio')) return null;
  const payload = frame.subarray(2 + headerLength);
  return payload.length > 0 ? payload : null;
}
