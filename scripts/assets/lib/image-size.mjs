/**
 * 从图片字节头读取尺寸；只支持本项目资产会用到的 PNG / JPEG / WebP。
 * 返回 null 表示格式未知，由调用方决定是否作为警告。
 */
export function imageSize(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (isPng(bytes)) return pngSize(bytes);
  if (isJpeg(bytes)) return jpegSize(bytes);
  if (isWebp(bytes)) return webpSize(bytes);
  return null;
}

export function imageMime(bytes) {
  if (isPng(bytes)) return 'image/png';
  if (isJpeg(bytes)) return 'image/jpeg';
  if (isWebp(bytes)) return 'image/webp';
  return null;
}

function isPng(bytes) {
  return bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG';
}

function pngSize(bytes) {
  if (bytes.length < 24) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function isJpeg(bytes) {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

function jpegSize(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      if (offset + 7 > bytes.length) return null;
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  return null;
}

function isWebp(bytes) {
  return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

function webpSize(bytes) {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourcc = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (fourcc === 'VP8X' && data + 10 <= bytes.length) {
      return {
        width: 1 + bytes.readUIntLE(data + 4, 3),
        height: 1 + bytes.readUIntLE(data + 7, 3),
      };
    }
    if (fourcc === 'VP8 ' && data + 10 <= bytes.length) {
      const width = bytes.readUInt16LE(data + 6) & 0x3fff;
      const height = bytes.readUInt16LE(data + 8) & 0x3fff;
      return { width, height };
    }
    if (fourcc === 'VP8L' && data + 5 <= bytes.length) {
      const bits = bytes.readUInt32LE(data + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    offset = data + size + (size % 2);
  }
  return null;
}
