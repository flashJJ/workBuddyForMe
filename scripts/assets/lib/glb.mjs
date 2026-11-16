import fs from 'node:fs';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

/** 读取 GLB 的 JSON 与 BIN 两个 chunk */
export function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 12 || buf.readUInt32LE(0) !== GLB_MAGIC || buf.readUInt32LE(4) !== 2) {
    throw new Error(`${file} 不是 glTF 2.0 二进制文件`);
  }
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) json = JSON.parse(data.toString('utf8'));
    else if (type === BIN_CHUNK) bin = data;
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  if (!json) throw new Error(`${file} 缺少 JSON chunk`);
  return { json, bin };
}

/** 取出 GLB image 的原始字节（bufferView 或 data URI） */
export function imageBytes(json, bin, image) {
  if (image.bufferView !== undefined && bin) {
    const view = json.bufferViews?.[image.bufferView];
    if (!view) return null;
    const start = view.byteOffset ?? 0;
    return bin.subarray(start, start + view.byteLength);
  }
  const uri = image.uri;
  if (typeof uri === 'string' && uri.startsWith('data:')) {
    const base64 = uri.slice(uri.indexOf(',') + 1);
    return Buffer.from(base64, 'base64');
  }
  return null;
}

/** 模型内全部带 targetNames 的 mesh primitive 形态签名 */
export function morphSignature(json) {
  const meshes = (json.meshes ?? [])
    .map((mesh) => ({
      name: mesh.name ?? '',
      primitives: (mesh.primitives ?? []).map((primitive) => primitive.extras?.targetNames ?? []),
    }))
    .filter((mesh) => mesh.primitives.some((names) => names.length > 0));
  return {
    meshes,
    text: JSON.stringify(meshes),
    morphCount: meshes.reduce(
      (max, mesh) => Math.max(max, ...mesh.primitives.map((names) => names.length), 0),
      0,
    ),
  };
}

/** VRM0 humanoid 骨骼数量；非 VRM 返回 null */
export function boneCount(json) {
  return json.extensions?.VRM?.humanoid?.humanBones?.length ?? null;
}
