/**
 * VRM 精简：删除全零的 morph target 法线（NORMAL）并回收不再引用的
 * accessor / bufferView / 二进制数据，输出结构与原文件一致。
 *
 * 用法：
 *   node scripts/avatar/compress-vrm.mjs <input.vrm> <output.vrm>
 *
 * 与旧版精简脚本的差别：
 * - accessor / bufferView 全部重新编号，mesh/skin/animation 引用同步改写；
 * - image.bufferView 也在回收范围内，避免出现「图片引用越界」导致
 *   GLTFLoader 报 `Cannot read properties of undefined (reading 'extensions')`；
 * - morph target 只删属性、不删 target 槽位，VRM 表情的 target 索引保持不变。
 */

import fs from 'node:fs';
import path from 'node:path';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const FLOAT = 5126;

function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== GLB_MAGIC || buf.readUInt32LE(4) !== 2) {
    throw new Error('不是 glTF 2.0 二进制文件');
  }
  let offset = 12;
  let json = null;
  let bin = Buffer.alloc(0);
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) json = JSON.parse(data.toString('utf8'));
    if (type === BIN_CHUNK) bin = data;
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  if (!json) throw new Error('GLB 缺少 JSON chunk');
  return { json, bin };
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

/** 判断 accessor 是否全零（只处理 float、非 sparse；其它情况保守地当作非零） */
function isAllZero(json, bin, accessorIndex) {
  const acc = json.accessors?.[accessorIndex];
  if (!acc || acc.componentType !== FLOAT || acc.sparse) return false;
  const bv = json.bufferViews?.[acc.bufferView];
  if (!bv) return false;
  const comps = COMPONENTS[acc.type] ?? 1;
  const stride = bv.byteStride ?? comps * 4;
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  for (let i = 0; i < acc.count; i += 1) {
    for (let c = 0; c < comps; c += 1) {
      const at = base + i * stride + c * 4;
      if (at + 4 > bin.length) return false;
      if (bin.readFloatLE(at) !== 0) return false;
    }
  }
  return true;
}

/** 删除全零 morph 法线/切线 */
function dropZeroMorphNormals(json, bin) {
  let removed = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      for (const target of primitive.targets ?? []) {
        for (const key of ['NORMAL', 'TANGENT']) {
          const index = target[key];
          if (typeof index === 'number' && isAllZero(json, bin, index)) {
            delete target[key];
            removed += 1;
          }
        }
      }
    }
  }
  return removed;
}

function collectUsedAccessors(json) {
  const used = new Set();
  const add = (value) => {
    if (typeof value === 'number') used.add(value);
  };
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      for (const value of Object.values(primitive.attributes ?? {})) add(value);
      add(primitive.indices);
      for (const target of primitive.targets ?? []) {
        for (const value of Object.values(target)) add(value);
      }
    }
  }
  for (const skin of json.skins ?? []) add(skin.inverseBindMatrices);
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers ?? []) {
      add(sampler.input);
      add(sampler.output);
    }
  }
  return used;
}

/** 重新编号 accessor / bufferView，并重建 BIN */
function compact(json, bin) {
  const usedAccessors = collectUsedAccessors(json);
  const accessorMap = new Map();
  const newAccessors = [];
  for (let i = 0; i < (json.accessors ?? []).length; i += 1) {
    if (!usedAccessors.has(i)) continue;
    accessorMap.set(i, newAccessors.length);
    newAccessors.push(json.accessors[i]);
  }

  const usedBufferViews = new Set();
  for (const accessor of newAccessors) {
    if (typeof accessor.bufferView === 'number') usedBufferViews.add(accessor.bufferView);
    if (accessor.sparse?.indices) usedBufferViews.add(accessor.sparse.indices.bufferView);
    if (accessor.sparse?.values) usedBufferViews.add(accessor.sparse.values.bufferView);
  }
  for (const image of json.images ?? []) {
    if (typeof image.bufferView === 'number') usedBufferViews.add(image.bufferView);
  }

  const bufferViewMap = new Map();
  const newBufferViews = [];
  const chunks = [];
  let offset = 0;
  for (let i = 0; i < (json.bufferViews ?? []).length; i += 1) {
    if (!usedBufferViews.has(i)) continue;
    const bv = json.bufferViews[i];
    const start = bv.byteOffset ?? 0;
    const bytes = bin.subarray(start, start + bv.byteLength);
    bufferViewMap.set(i, newBufferViews.length);
    newBufferViews.push({ ...bv, buffer: 0, byteOffset: offset });
    chunks.push(bytes);
    offset += bytes.length;
    const pad = (4 - (offset % 4)) % 4;
    if (pad > 0) {
      chunks.push(Buffer.alloc(pad));
      offset += pad;
    }
  }
  const newBin = Buffer.concat(chunks);

  for (const accessor of newAccessors) {
    if (typeof accessor.bufferView === 'number') accessor.bufferView = bufferViewMap.get(accessor.bufferView);
    if (accessor.sparse?.indices) accessor.sparse.indices.bufferView = bufferViewMap.get(accessor.sparse.indices.bufferView);
    if (accessor.sparse?.values) accessor.sparse.values.bufferView = bufferViewMap.get(accessor.sparse.values.bufferView);
  }
  for (const image of json.images ?? []) {
    if (typeof image.bufferView === 'number') image.bufferView = bufferViewMap.get(image.bufferView);
  }

  const mapAccessor = (value) => (typeof value === 'number' ? accessorMap.get(value) : value);
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.attributes) {
        for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] = mapAccessor(primitive.attributes[key]);
      }
      if (primitive.indices !== undefined) primitive.indices = mapAccessor(primitive.indices);
      for (const target of primitive.targets ?? []) {
        for (const key of Object.keys(target)) target[key] = mapAccessor(target[key]);
      }
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = mapAccessor(skin.inverseBindMatrices);
  }
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers ?? []) {
      sampler.input = mapAccessor(sampler.input);
      sampler.output = mapAccessor(sampler.output);
    }
  }

  json.accessors = newAccessors;
  json.bufferViews = newBufferViews;
  json.buffers = [{ byteLength: newBin.length }];
  return newBin;
}

function writeGlb(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);
  const binPad = (4 - (bin.length % 4)) % 4;
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPad)]);
  const total = 12 + 8 + jsonChunk.length + (binChunk.length > 0 ? 8 + binChunk.length : 0);
  const out = Buffer.alloc(total);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(JSON_CHUNK, 16);
  jsonChunk.copy(out, 20);
  if (binChunk.length > 0) {
    const at = 20 + jsonChunk.length;
    out.writeUInt32LE(binChunk.length, at);
    out.writeUInt32LE(BIN_CHUNK, at + 4);
    binChunk.copy(out, at + 8);
  }
  return out;
}

/** 输出前做一次引用越界自检，避免再次产出坏文件 */
function validate(json) {
  const problems = [];
  const bvCount = json.bufferViews.length;
  const accCount = json.accessors.length;
  const imgCount = (json.images ?? []).length;
  const badIndex = (value, max) => typeof value === 'number' && (value < 0 || value >= max);
  json.accessors.forEach((acc, i) => {
    if (badIndex(acc.bufferView, bvCount)) problems.push(`accessors[${i}].bufferView=${acc.bufferView}`);
  });
  (json.images ?? []).forEach((img, i) => {
    if (badIndex(img.bufferView, bvCount)) problems.push(`images[${i}].bufferView=${img.bufferView}`);
  });
  (json.textures ?? []).forEach((tex, i) => {
    if (badIndex(tex.source, imgCount)) problems.push(`textures[${i}].source=${tex.source}`);
  });
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      for (const value of Object.values(primitive.attributes ?? {})) {
        if (badIndex(value, accCount)) problems.push(`primitive.attributes 越界: ${value}`);
      }
      for (const target of primitive.targets ?? []) {
        for (const value of Object.values(target)) {
          if (badIndex(value, accCount)) problems.push(`primitive.targets 越界: ${value}`);
        }
      }
    }
  }
  if (problems.length > 0) throw new Error(`输出自检失败：${problems.slice(0, 5).join(', ')}`);
}

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('用法: node scripts/avatar/compress-vrm.mjs <input.vrm> <output.vrm>');
  process.exit(1);
}
const { json, bin } = readGlb(input);
if (!json.extensions?.VRM && !json.extensions?.VRMC_vrm) throw new Error('缺少 VRM 扩展');
const removed = dropZeroMorphNormals(json, bin);
const newBin = compact(json, bin);
validate(json);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, writeGlb(json, newBin));
const before = fs.statSync(input).size;
const after = fs.statSync(output).size;
console.log(
  `[vrm] ${path.basename(input)} → ${path.basename(output)} | 删除全零 morph 属性 ${removed} 个 | ${(before / 1048576).toFixed(1)}MB → ${(after / 1048576).toFixed(1)}MB`,
);
