/**
 * GLB 读写与贴图引用分析（供 optimize-vrm / inspect-vrm-textures 共用）。
 */
export const GLB_MAGIC = 0x46546c67;
export const CHUNK_JSON = 0x4e4f534a;
export const CHUNK_BIN = 0x004e4942;

export const align4 = (n) => (n + 3) & ~3;

export function parseGlb(buffer, label = 'GLB') {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${label}: 不是 GLB 文件`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === CHUNK_JSON) json = JSON.parse(buffer.subarray(start, start + length).toString('utf8'));
    else if (type === CHUNK_BIN) bin = buffer.subarray(start, start + length);
    offset = start + length;
  }
  if (!json || !bin) throw new Error(`${label}: GLB 缺少 JSON/BIN chunk`);
  return { json, bin };
}

export function writeGlb(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadded = Buffer.alloc(align4(jsonBytes.length), 0x20);
  jsonBytes.copy(jsonPadded);
  const binPadded = Buffer.alloc(align4(bin.length), 0);
  bin.copy(binPadded);
  const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonPadded.length, 12);
  out.writeUInt32LE(CHUNK_JSON, 16);
  jsonPadded.copy(out, 20);
  const binHeader = 20 + jsonPadded.length;
  out.writeUInt32LE(binPadded.length, binHeader);
  out.writeUInt32LE(CHUNK_BIN, binHeader + 4);
  binPadded.copy(out, binHeader + 8);
  return out;
}

/** 读取图片字节：优先 bufferView，其次 base64 data URI */
export function imageBytes(json, bin, image) {
  if (image.bufferView !== undefined) {
    const view = json.bufferViews[image.bufferView];
    if (!view) return null;
    return bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  }
  if (typeof image.uri === 'string' && image.uri.startsWith('data:')) {
    return Buffer.from(image.uri.slice(image.uri.indexOf(',') + 1), 'base64');
  }
  return null;
}

/**
 * 每张图被哪些 材质.通道 引用，以及引用它的材质是否用到 alpha。
 * MASK（cutout）与 BLEND 都算用到 alpha。
 */
export function collectImageUsage(json) {
  const usage = new Map();
  const textures = json.textures ?? [];
  const properties = json.extensions?.VRM?.materialProperties ?? [];
  const touch = (textureIndex) => {
    const texture = textures[textureIndex];
    return texture && texture.source !== undefined ? texture.source : null;
  };
  const add = (imageIndex, slot, materialIndex, alphaUsed) => {
    if (!usage.has(imageIndex)) usage.set(imageIndex, { slots: new Set(), materials: new Set(), alphaUsed: false });
    const entry = usage.get(imageIndex);
    entry.slots.add(slot);
    entry.materials.add(materialIndex);
    if (alphaUsed) entry.alphaUsed = true;
  };
  for (const [index, material] of (json.materials ?? []).entries()) {
    const blend = properties[index]?.floatProperties?._BlendMode;
    const mode = material.alphaMode ?? 'OPAQUE';
    const alphaUsed = mode === 'MASK' || mode === 'BLEND' || (typeof blend === 'number' && blend >= 1);
    const pbr = material.pbrMetallicRoughness ?? {};
    const slots = {
      baseColor: pbr.baseColorTexture,
      metalRough: pbr.metallicRoughnessTexture,
      normal: material.normalTexture,
      occlusion: material.occlusionTexture,
      emissive: material.emissiveTexture,
    };
    for (const [slot, ref] of Object.entries(slots)) {
      if (!ref) continue;
      const imageIndex = touch(ref.index);
      if (imageIndex !== null) add(imageIndex, slot, index, alphaUsed);
    }
  }
  for (const [index, property] of properties.entries()) {
    const blend = property.floatProperties?._BlendMode;
    const mode = json.materials?.[index]?.alphaMode ?? 'OPAQUE';
    const alphaUsed = mode === 'MASK' || mode === 'BLEND' || (typeof blend === 'number' && blend >= 1);
    for (const [slot, textureIndex] of Object.entries(property.textureProperties ?? {})) {
      const imageIndex = touch(textureIndex);
      if (imageIndex !== null) add(imageIndex, slot, index, alphaUsed);
    }
  }
  return usage;
}
