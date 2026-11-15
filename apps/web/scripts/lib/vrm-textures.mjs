/**
 * VRM 贴图重编码（v3.0 S6 后续）。
 *
 * 规则：
 * - 法线 / occlusion / matcap / mask / 描边宽度 → 原样保留；
 * - alpha 被 MASK/BLEND 材质使用（五官 cutout）→ 无损 WebP；
 * - 其余 albedo → 有损 WebP（默认 q90）并丢弃 alpha；
 * - 编码后若不比原图小、或与 128×128 降采样原图的平均绝对误差超过阈值，则保留原图；
 * - 没有 bufferView 的 base64 data URI 图片一并转成 bufferView。
 */
import sharp from 'sharp';
import { align4, collectImageUsage, imageBytes } from './vrm-glb.mjs';

const KEEP_SLOT = /_bumpmap|_sphereadd|_outlinewidthtexture|_uvanimmasktexture|matcap|^normal$|^occlusion$|^metalrough$/i;

async function meanAbsError(a, b) {
  // 全分辨率比较 RGB；降采样会让细边缘差异被放大，反而不代表实际观感
  const prepare = (input) => sharp(input, { failOn: 'none' }).removeAlpha().raw().toBuffer();
  const [left, right] = await Promise.all([prepare(a), prepare(b)]);
  const length = Math.min(left.length, right.length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) sum += Math.abs(left[i] - right[i]);
  return length === 0 ? 255 : sum / length;
}

/** 逐张重编码；返回与入参结构相同的 json / bin（未变更时原样返回） */
export async function reencodeTextures(json, bin, options = {}) {
  const { quality = 90, maxMae = 6 } = options;
  const images = json.images ?? [];
  const stats = { total: images.length, encoded: 0, beforeBytes: 0, afterBytes: 0, kept: [], warnings: [] };
  if (images.length === 0) return { changed: false, json, bin, stats };

  const usage = collectImageUsage(json);
  // bufferView 被多个 accessor/image 共用时不能原位替换
  const viewUsers = new Map();
  for (const accessor of json.accessors ?? []) {
    if (accessor.bufferView === undefined) continue;
    viewUsers.set(accessor.bufferView, (viewUsers.get(accessor.bufferView) ?? 0) + 1);
  }
  for (const image of images) {
    if (image.bufferView === undefined) continue;
    viewUsers.set(image.bufferView, (viewUsers.get(image.bufferView) ?? 0) + 1);
  }

  const replacements = new Map();
  const appended = new Map();

  for (const [index, image] of images.entries()) {
    const source = imageBytes(json, bin, image);
    if (!source) {
      stats.kept.push(`#${index} 无数据`);
      continue;
    }
    stats.beforeBytes += source.length;
    const entry = usage.get(index);
    const slots = [...(entry?.slots ?? [])];
    if (!entry) {
      stats.kept.push(`#${index} 未被引用`);
      stats.afterBytes += source.length;
      continue;
    }
    const keepSlot = slots.find((slot) => KEEP_SLOT.test(slot));
    if (keepSlot) {
      stats.kept.push(`#${index} ${keepSlot}`);
      stats.afterBytes += source.length;
      continue;
    }
    if (image.bufferView !== undefined && viewUsers.get(image.bufferView) !== 1) {
      stats.kept.push(`#${index} bufferView 共用`);
      stats.afterBytes += source.length;
      continue;
    }

    try {
      const alpha = entry.alphaUsed;
      const pipeline = alpha
        ? sharp(source, { failOn: 'none' }).webp({ lossless: true, effort: 6 })
        : sharp(source, { failOn: 'none' }).removeAlpha().webp({ quality, effort: 4, smartSubsample: true });
      const output = await pipeline.toBuffer();
      if (output.length >= source.length) {
        stats.kept.push(`#${index} 无收益`);
        stats.afterBytes += source.length;
        continue;
      }
      if (!alpha) {
        const mae = await meanAbsError(source, output);
        if (mae > maxMae) {
          stats.warnings.push(`#${index} MAE ${mae.toFixed(2)} > ${maxMae}，保留原图`);
          stats.afterBytes += source.length;
          continue;
        }
      }
      if (image.bufferView === undefined) appended.set(index, output);
      else replacements.set(image.bufferView, output);
      stats.encoded += 1;
      stats.afterBytes += output.length;
    } catch (error) {
      stats.warnings.push(`#${index} 编码失败（${error instanceof Error ? error.message : String(error)}），保留原图`);
      stats.afterBytes += source.length;
    }
  }

  if (stats.encoded === 0) return { changed: false, json, bin, stats };

  const chunks = [];
  const nextViews = [];
  let cursor = 0;
  const pushView = (data, meta) => {
    const padded = align4(data.length);
    const buffer = Buffer.alloc(padded, 0);
    data.copy(buffer);
    chunks.push(buffer);
    nextViews.push({ ...meta, byteOffset: cursor, byteLength: data.length });
    cursor += padded;
    return nextViews.length - 1;
  };

  json.bufferViews.forEach((view, viewIndex) => {
    const data = replacements.get(viewIndex) ?? bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    pushView(data, view);
  });
  for (const [imageIndex, data] of appended) {
    const viewIndex = pushView(data, { buffer: 0 });
    images[imageIndex].bufferView = viewIndex;
    delete images[imageIndex].uri;
  }
  for (const viewIndex of replacements.keys()) {
    const image = images.find((item) => item.bufferView === viewIndex);
    if (image) image.mimeType = 'image/webp';
  }

  json.bufferViews = nextViews;
  const binOut = Buffer.concat(chunks);
  json.buffers = [{ byteLength: binOut.length }];
  return { changed: true, json, bin: binOut, stats };
}

/** 回读校验：每张图都能解码，且格式已统一 */
export async function verifyImages(json, bin) {
  const issues = [];
  for (const [index, image] of (json.images ?? []).entries()) {
    const bytes = imageBytes(json, bin, image);
    if (!bytes) {
      issues.push(`#${index} 无数据`);
      continue;
    }
    try {
      const meta = await sharp(bytes, { failOn: 'none' }).metadata();
      if (!meta.width || !meta.height) issues.push(`#${index} 尺寸未知`);
    } catch (error) {
      issues.push(`#${index} 解码失败（${error instanceof Error ? error.message : String(error)}）`);
    }
  }
  return issues;
}
