/**
 * 内置 VRM 体积优化（v3.0 M4 / S6）。
 *
 * 两步，均无损或近似无损：
 * 1. morph target 的 POSITION 转 glTF sparse accessor（118 个表情只存非零顶点）；
 * 2. 贴图重编码：albedo → WebP q90（丢弃未使用的 alpha），五官 cutout → 无损 WebP，
 *    法线/matcap/mask 保留原图；base64 data URI 图片转成 bufferView。
 *
 * 用法（apps/web 目录）：
 *   node scripts/optimize-vrm.mjs                 # assets-src/vrm → public/vrm/models
 *   node scripts/optimize-vrm.mjs --in <dir> --out <dir>
 *   node scripts/optimize-vrm.mjs --dry           # 只统计不写文件
 *   node scripts/optimize-vrm.mjs --no-textures   # 只做 sparse，不动贴图
 *   node scripts/optimize-vrm.mjs --quality 88    # 调整有损 WebP 质量
 *
 * 原始模型请放在 apps/web/assets-src/vrm（已被 .gitignore 忽略），
 * 后续要换压缩策略或恢复贴图时以它为唯一源，不要反向从 public 改。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { align4, parseGlb, writeGlb } from './lib/vrm-glb.mjs';
import { reencodeTextures, verifyImages } from './lib/vrm-textures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EPSILON = 1e-7;

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
};
const dry = args.includes('--dry');
const withTextures = !args.includes('--no-textures');
const quality = Number(argValue('quality', 90));
const inDir = resolve(argValue('in', join(HERE, '../assets-src/vrm')));
const outDir = resolve(argValue('out', join(HERE, '../public/vrm/models')));

function readFloatVec3(json, bin, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  if (!accessor || accessor.componentType !== 5126 || accessor.type !== 'VEC3') return null;
  if (accessor.bufferView === undefined) return null;
  const view = json.bufferViews[accessor.bufferView];
  const stride = view.byteStride ?? 12;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const count = accessor.count;
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const p = start + i * stride;
    out[i * 3] = bin.readFloatLE(p);
    out[i * 3 + 1] = bin.readFloatLE(p + 4);
    out[i * 3 + 2] = bin.readFloatLE(p + 8);
  }
  return out;
}

function collectMorphAccessors(json) {
  const targets = new Set();
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      for (const target of prim.targets ?? []) {
        for (const [attribute, index] of Object.entries(target)) {
          if (attribute === 'POSITION') targets.add(index);
        }
      }
    }
  }
  return targets;
}

function optimize(glb, label) {
  const { json, bin } = glb;
  const targetAccessors = collectMorphAccessors(json);
  if (targetAccessors.size === 0) return { changed: false, reason: '没有 morph target' };

  // 目标 accessor 独占的 bufferView 才能安全移除；被其他数据共用时跳过该 accessor
  const otherRefs = new Set();
  json.accessors.forEach((accessor, index) => {
    if (!targetAccessors.has(index) && accessor.bufferView !== undefined) otherRefs.add(accessor.bufferView);
  });
  for (const image of json.images ?? []) if (image.bufferView !== undefined) otherRefs.add(image.bufferView);

  const removableViews = new Set();
  const skipped = [];
  const sparsePlans = [];
  let originalBytes = 0;
  let sparseBytes = 0;

  for (const rawIndex of targetAccessors) {
    const accessorIndex = Number(rawIndex);
    const accessor = json.accessors[accessorIndex];
    const values = readFloatVec3(json, bin, accessorIndex);
    if (!values) {
      skipped.push(`accessor ${accessorIndex} 不是 float3，跳过`);
      continue;
    }
    if (accessor.bufferView === undefined) continue;
    if (otherRefs.has(accessor.bufferView)) {
      skipped.push(`accessor ${accessorIndex} 的 bufferView 被共用，跳过`);
      continue;
    }
    originalBytes += json.bufferViews[accessor.bufferView].byteLength;

    const indices = [];
    const sparseValues = [];
    for (let i = 0; i < accessor.count; i += 1) {
      const x = values[i * 3];
      const y = values[i * 3 + 1];
      const z = values[i * 3 + 2];
      if (Math.abs(x) > EPSILON || Math.abs(y) > EPSILON || Math.abs(z) > EPSILON) {
        indices.push(i);
        sparseValues.push(x, y, z);
      }
    }
    // sparse.count 必须 ≥ 1：全零 morph 用「索引 0 值 0」表示，语义不变
    if (indices.length === 0) {
      indices.push(0);
      sparseValues.push(0, 0, 0);
    }

    removableViews.add(accessor.bufferView);
    sparsePlans.push({ accessorIndex, accessor, indices, values: sparseValues });
    sparseBytes += align4(indices.length * (indices.length > 65535 ? 4 : 2)) + align4(sparseValues.length * 4);
  }

  if (sparsePlans.length === 0) return { changed: false, reason: skipped.join('; ') || '没有可稀疏化的 morph' };

  // 重建 BIN：保留非 morph 的 bufferView，重新计算 byteOffset
  const chunks = [];
  const viewRemap = new Map();
  const nextViews = [];
  let cursor = 0;
  json.bufferViews.forEach((view, index) => {
    if (removableViews.has(index)) return;
    const length = view.byteLength;
    const padded = align4(length);
    const data = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + length);
    const buffer = Buffer.alloc(padded, 0);
    data.copy(buffer);
    chunks.push(buffer);
    viewRemap.set(index, nextViews.length);
    nextViews.push({ ...view, byteOffset: cursor });
    cursor += padded;
  });

  const appendView = (data, extra = {}) => {
    const padded = align4(data.length);
    const buffer = Buffer.alloc(padded, 0);
    data.copy(buffer);
    chunks.push(buffer);
    nextViews.push({ buffer: 0, byteOffset: cursor, byteLength: data.length, ...extra });
    cursor += padded;
    return nextViews.length - 1;
  };

  for (const plan of sparsePlans) {
    const useShort = plan.accessor.count <= 65536;
    const indexArray = useShort
      ? Uint16Array.from(plan.indices)
      : Uint32Array.from(plan.indices);
    const valueArray = Float32Array.from(plan.values);
    const indicesView = appendView(Buffer.from(indexArray.buffer, indexArray.byteOffset, indexArray.byteLength));
    const valuesView = appendView(Buffer.from(valueArray.buffer, valueArray.byteOffset, valueArray.byteLength));

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < plan.values.length; i += 3) {
      const x = plan.values[i], y = plan.values[i + 1], z = plan.values[i + 2];
      minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
    }

    const accessor = plan.accessor;
    delete accessor.bufferView;
    delete accessor.byteOffset;
    accessor.min = [minX, minY, minZ];
    accessor.max = [maxX, maxY, maxZ];
    accessor.sparse = {
      count: plan.indices.length,
      indices: { bufferView: indicesView, byteOffset: 0, componentType: useShort ? 5123 : 5125 },
      values: { bufferView: valuesView, byteOffset: 0 },
    };
  }

  // 其余 accessor 的 bufferView 索引重映射
  json.accessors.forEach((accessor, index) => {
    if (targetAccessors.has(index) && accessor.sparse) return;
    if (accessor.bufferView === undefined) return;
    const mapped = viewRemap.get(accessor.bufferView);
    if (mapped === undefined) {
      // 保底：理论上不会发生（被移除的只有 morph 独占 view）
      throw new Error(`${label}: accessor ${index} 引用了被移除的 bufferView ${accessor.bufferView}`);
    }
    accessor.bufferView = mapped;
  });
  // images 同样重映射
  for (const image of json.images ?? []) {
    if (image.bufferView === undefined) continue;
    image.bufferView = viewRemap.get(image.bufferView);
  }

  json.bufferViews = nextViews;
  const binOut = Buffer.concat(chunks);
  json.buffers = [{ byteLength: binOut.length }];

  return {
    changed: true,
    json,
    bin: binOut,
    stats: { originalBytes, sparseBytes, targets: sparsePlans.length, skipped },
  };
}

const files = existsSync(inDir)
  ? readdirSync(inDir).filter((name) => extname(name).toLowerCase() === '.vrm')
  : [];
if (files.length === 0) {
  console.error(`[vrm] 源目录没有 .vrm：${inDir}`);
  process.exit(1);
}
if (!dry) mkdirSync(outDir, { recursive: true });

let failed = false;
for (const name of files) {
  const input = readFileSync(join(inDir, name));
  const glb = parseGlb(input, name);
  const targetNames = glb.json.meshes?.[1]?.primitives?.[0]?.extras?.targetNames ?? [];
  const bindCount = glb.json.extensions?.VRM?.blendShapeMaster?.blendShapeGroups?.length ?? 0;

  const sparse = optimize(glb, name);
  let current = sparse.changed ? { json: sparse.json, bin: sparse.bin } : { json: glb.json, bin: glb.bin };
  const textures = withTextures ? await reencodeTextures(current.json, current.bin, { quality }) : null;
  if (textures?.changed) current = { json: textures.json, bin: textures.bin };
  if (!sparse.changed && !textures?.changed) {
    console.log(`[vrm] ${name}: 跳过（${sparse.reason ?? '没有可优化的数据'}）`);
    continue;
  }

  const output = writeGlb(current.json, current.bin);
  // 回读校验：morph 数量/名称/VRM 绑定必须原样保留，贴图必须全部可解码
  const check = parseGlb(output, `${name}(优化后)`);
  const nextNames = check.json.meshes?.[1]?.primitives?.[0]?.extras?.targetNames ?? [];
  const nextBindCount = check.json.extensions?.VRM?.blendShapeMaster?.blendShapeGroups?.length ?? 0;
  if (nextNames.length !== targetNames.length || nextBindCount !== bindCount) {
    throw new Error(`${name}: 优化后 morph/绑定数量变化（${targetNames.length}→${nextNames.length}）`);
  }
  if (nextNames.some((value, index) => value !== targetNames[index])) {
    throw new Error(`${name}: 优化后 morph 名称顺序变化`);
  }
  const issues = await verifyImages(check.json, check.bin);
  if (issues.length > 0) throw new Error(`${name}: 贴图校验失败：${issues.slice(0, 3).join('; ')}`);

  const ratio = ((1 - output.length / input.length) * 100).toFixed(1);
  console.log(
    `[vrm] ${name}: ${(input.length / 1048576).toFixed(2)}MB → ${(output.length / 1048576).toFixed(2)}MB (-${ratio}%)`,
  );
  if (sparse.changed) {
    const stats = sparse.stats;
    console.log(
      `      morph ${stats.targets} 个：${(stats.originalBytes / 1048576).toFixed(2)}MB → ${(stats.sparseBytes / 1048576).toFixed(2)}MB`,
    );
    if (stats.skipped.length > 0) console.log(`      跳过：${stats.skipped.join('; ')}`);
  }
  if (textures?.stats) {
    const stats = textures.stats;
    console.log(
      `      贴图 ${stats.encoded}/${stats.total} 张：${(stats.beforeBytes / 1048576).toFixed(2)}MB → ${(stats.afterBytes / 1048576).toFixed(2)}MB，保留 ${stats.kept.length} 张`,
    );
    if (stats.warnings.length > 0) console.log(`      贴图告警：${stats.warnings.join('; ')}`);
    if (stats.kept.length > 0) console.log(`      贴图保留：${stats.kept.join('; ')}`);
  }
  if (!dry) writeFileSync(join(outDir, name), output);
}
if (failed) process.exitCode = 1;
