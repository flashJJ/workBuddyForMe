/**
 * v2.0 M5 .wbfm-pack 二进制魔数嗅探（零三方依赖）。
 * 图片判定以魔数为准（04 §4），同时识别伪装成图片的压缩包/模型/音频。
 */

export type ImageKind = 'png' | 'jpeg' | 'webp' | null;

export function sniffImage(buf: Uint8Array): ImageKind {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a
  ) {
    return 'png';
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  // WEBP: 'RIFF' .... 'WEBP'
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

/** 危险负载魔数（不论扩展名、不论落在哪个条目，出现即拒） */
export function sniffForbiddenPayload(buf: Uint8Array): string | null {
  if (buf.length < 4) return null;
  // ZIP/JAR/APK/OOXML 本地文件头 PK\x03\x04（嵌套压缩包）
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return '嵌套压缩包（ZIP）';
  }
  // glTF/GLB/VRM：ASCII 'glTF'
  if (buf[0] === 0x67 && buf[1] === 0x6c && buf[2] === 0x54 && buf[3] === 0x46) {
    return '3D 模型（glTF/GLB/VRM）';
  }
  // Ogg 音频/视频容器
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) {
    return '音频（Ogg）';
  }
  // FLAC
  if (buf[0] === 0x66 && buf[1] === 0x4c && buf[2] === 0x61 && buf[3] === 0x43) {
    return '音频（FLAC）';
  }
  // WAV: RIFF....WAVE（与 WEBP 同 RIFF 壳，按格式字区分）
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf.length >= 12 &&
    buf[8] === 0x57 &&
    buf[9] === 0x41 &&
    buf[10] === 0x56 &&
    buf[11] === 0x45
  ) {
    return '音频（WAV）';
  }
  // ID3 标签头（MP3）
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    return '音频（MP3）';
  }
  // MPEG 帧同步 0xFFEx/0xFFFx
  if (buf[0] === 0xff && ((buf[1] ?? 0) & 0xe0) === 0xe0) {
    return '音频（MPEG）';
  }
  return null;
}

export function imageKindFromExt(path: string): ImageKind {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpeg';
  if (lower.endsWith('.webp')) return 'webp';
  return null;
}
