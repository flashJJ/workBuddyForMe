import {
  ALLOWED_IMAGE_MIME,
  IMAGE_COMPRESS_MAX_EDGE,
  IMAGE_COMPRESS_QUALITY,
} from '@wbfm/shared';

export interface CompressedImage {
  blob: Blob;
  filename: string;
}

/** 是否允许的图片类型（粘贴/选择时即时拦截 gif/svg 等） */
export function isSupportedImage(file: File): boolean {
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(file.type);
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解码失败'));
    image.src = source;
  });
}

/**
 * 浏览器端压缩：最长边 ≤ 1600，超出等比缩放，统一导出 JPEG 0.85。
 * 已经达标的图片也重新编码（去除 EXIF 等隐性载荷），透明底衬白。
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  const source = URL.createObjectURL(file);
  try {
    const image = await loadImage(source);
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = longest > IMAGE_COMPRESS_MAX_EDGE ? IMAGE_COMPRESS_MAX_EDGE / longest : 1;
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器不支持 canvas 压缩');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', IMAGE_COMPRESS_QUALITY),
    );
    if (!blob) throw new Error('图片编码失败');
    const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
    return { blob, filename: `${baseName}.jpg` };
  } finally {
    URL.revokeObjectURL(source);
  }
}
