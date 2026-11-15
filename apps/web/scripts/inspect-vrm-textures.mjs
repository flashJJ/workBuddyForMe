/**
 * VRM 贴图清单（v3.0 M4 / S6 后续）：只读分析，不改模型。
 *
 * 输出每张贴图的格式、尺寸、体积、是否带 alpha，以及被哪些材质的哪个通道引用，
 * 并按「可安全有损 / 必须无损」分组，供后续贴图重编码决策使用。
 *
 * 用法（apps/web 目录）：
 *   node scripts/inspect-vrm-textures.mjs
 *   node scripts/inspect-vrm-textures.mjs --in <dir>
 *   node scripts/inspect-vrm-textures.mjs --md <path>   # 额外写 Markdown 清单
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
};
const inDir = resolve(argValue('in', join(HERE, '../assets-src/vrm')));
const mdPath = argValue('md', join(HERE, '../../../docs/plan/v3.0/milestone-m4-m5/vrm-texture-inventory.md'));

function parseGlb(buffer, label) {
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

function pngInfo(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  let hasTrns = false;
  let offset = 8;
  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    if (type === 'tRNS') hasTrns = true;
    if (type === 'IEND') break;
    offset += 12 + len;
  }
  const alpha = colorType === 4 || colorType === 6 || (colorType === 3 && hasTrns);
  return { format: 'PNG', width, height, bitDepth, colorType, alpha };
}

function jpegInfo(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const len = buf.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        format: 'JPEG',
        width: buf.readUInt16BE(offset + 7),
        height: buf.readUInt16BE(offset + 5),
        alpha: false,
      };
    }
    offset += 2 + len;
  }
  return null;
}

function webpInfo(buf) {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') {
    const flags = buf[20];
    const width = 1 + buf.readUIntLE(24, 3);
    const height = 1 + buf.readUIntLE(27, 3);
    return { format: 'WEBP', width, height, alpha: (flags & 0x10) !== 0 };
  }
  return { format: 'WEBP', width: 0, height: 0, alpha: false };
}

function inspectImage(bytes) {
  return pngInfo(bytes) ?? jpegInfo(bytes) ?? webpInfo(bytes) ?? { format: 'UNKNOWN', width: 0, height: 0, alpha: false };
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)}MB`;
const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

/** 收集每张图被哪些 材质.通道 引用，并记录引用它的材质是否用到 alpha */
function collectRefs(json) {
  const refs = new Map();
  const textures = json.textures ?? [];
  const properties = json.extensions?.VRM?.materialProperties ?? [];
  const alphaMaterials = new Set();
  for (const [index, material] of (json.materials ?? []).entries()) {
    const mode = material.alphaMode ?? 'OPAQUE';
    const blend = properties[index]?.floatProperties?._BlendMode;
    // MASK（cutout）同样依赖 alpha 做轮廓裁切，必须算作在用
    if (mode === 'MASK' || mode === 'BLEND' || (typeof blend === 'number' && blend >= 1)) alphaMaterials.add(index);
  }
  const add = (textureIndex, label, materialIndex) => {
    const texture = textures[textureIndex];
    if (!texture || texture.source === undefined) return;
    if (!refs.has(texture.source)) refs.set(texture.source, { labels: [], materials: new Set() });
    const entry = refs.get(texture.source);
    entry.labels.push(label);
    entry.materials.add(materialIndex);
  };
  for (const [index, material] of (json.materials ?? []).entries()) {
    const name = material.name ?? `material_${index}`;
    const pbr = material.pbrMetallicRoughness ?? {};
    const slots = {
      baseColor: pbr.baseColorTexture,
      metalRough: pbr.metallicRoughnessTexture,
      normal: material.normalTexture,
      occlusion: material.occlusionTexture,
      emissive: material.emissiveTexture,
    };
    for (const [slot, ref] of Object.entries(slots)) if (ref) add(ref.index, `${name}.${slot}`, index);
  }
  // VRM 0.x：MToon 贴图全部在 materialProperties[].textureProperties
  for (const [index, property] of properties.entries()) {
    const name = json.materials?.[index]?.name ?? `material_${index}`;
    for (const [slot, textureIndex] of Object.entries(property.textureProperties ?? {})) {
      add(textureIndex, `${name}.${slot}`, index);
    }
  }
  return { refs, alphaMaterials };
}

function classify(alpha, alphaUsed, labels) {
  const joined = labels.join(' ').toLowerCase();
  // 法线/mask/matcap/描边宽度/UV 动画：重编码风险高、收益低，一律保留
  if (/\.normal|\.occlusion|_bumpmap|_sphereadd|_outlinewidthtexture|_uvanimmasktexture|matcap|mask/.test(joined)) {
    return 'keep';
  }
  // KK 导出里 ShadeTexture 常与 MainTex 指向同一张 albedo，不能单凭 _ShadeTexture 判为 ramp
  const isAlbedo = /\.basecolor|_maintex/.test(joined);
  if (!isAlbedo) return 'keep';
  // 有 alpha 通道但引用它的材质全是 OPAQUE，alpha 可丢弃
  return alpha && alphaUsed ? 'alpha' : 'lossy';
}

const RISK_LABEL = { keep: '保留原样', alpha: '无损压缩', lossy: '可有损' };

function analyze(file) {
  const buffer = readFileSync(file);
  const { json, bin } = parseGlb(buffer, file);
  const refs = collectRefs(json);
  const images = (json.images ?? []).map((image, index) => {
    const view = image.bufferView === undefined ? null : json.bufferViews[image.bufferView];
    const embedded = !view && typeof image.uri === 'string' && image.uri.startsWith('data:');
    const bytes = view
      ? bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
      : embedded
        ? Buffer.from(image.uri.slice(image.uri.indexOf(',') + 1), 'base64')
        : Buffer.alloc(0);
    const info = inspectImage(bytes);
    const entry = refs.refs.get(index);
    const labels = entry?.labels ?? [];
    const alphaUsed = entry ? [...entry.materials].some((m) => refs.alphaMaterials.has(m)) : false;
    return {
      index,
      mimeType: image.mimeType ?? '?',
      byteLength: bytes.length,
      width: info.width,
      height: info.height,
      format: info.format,
      alpha: info.alpha,
      alphaUsed,
      embedded,
      labels,
      risk: classify(info.alpha, alphaUsed, labels),
      hash: bytes.length ? createHash('sha1').update(bytes).digest('hex').slice(0, 12) : '',
    };
  });
  return { file, bufferSize: buffer.length, images, json };
}

const files = existsSync(inDir)
  ? readdirSync(inDir)
      .filter((name) => name.endsWith('.vrm'))
      .map((name) => join(inDir, name))
  : [];
if (files.length === 0) {
  console.error(`没有找到 VRM：${inDir}`);
  process.exit(1);
}

const results = files.map(analyze);
const lines = [
  '# VRM 贴图清单（v3.0 S6 后续）',
  '',
  '> 由 `apps/web/scripts/inspect-vrm-textures.mjs` 生成，只读统计，不修改模型。',
  '> 「可有损」= 无 alpha 或无材质实际使用 alpha 的 albedo，可转 WebP q88–92；「无损压缩」= alpha 被 MASK/BLEND 材质使用的贴图，建议无损 WebP 或 PNG 量化；',
  '> 「保留原样」= 法线/mask/matcap/阴影 ramp，误差敏感，重编码收益低风险高。',
  '> `data URI` = 以 base64 内嵌、没有 bufferView 的图片，重编码时要一并转成 bufferView。',
  '',
  '## 总览',
  '',
  '| 模型 | 文件体积 | 贴图数 | 贴图总量 | 占比 | 可有损 | 需无损 | 保留原样 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
];

for (const result of results) {
  const name = result.file.split(/[\\/]/).pop();
  const total = result.images.reduce((sum, image) => sum + image.byteLength, 0);
  const byRisk = (risk) => result.images.filter((image) => image.risk === risk);
  const sum = (list) => list.reduce((acc, image) => acc + image.byteLength, 0);
  lines.push(
    `| ${name.replace(/\.vrm$/, '')} | ${mb(result.bufferSize)} | ${result.images.length} | ${mb(total)} | ${((total / result.bufferSize) * 100).toFixed(0)}% | ${sum(byRisk('lossy')) ? mb(sum(byRisk('lossy'))) : 0} | ${mb(sum(byRisk('alpha')))} | ${mb(sum(byRisk('keep')))} |`,
  );
}

for (const result of results) {
  const name = result.file.split(/[\\/]/).pop().replace(/\.vrm$/, '');
  lines.push('', `## ${name}`, '', '| # | 格式 | 尺寸 | 体积 | alpha | 引用 | 处理建议 |', '| --- | --- | --- | --- | --- | --- | --- |');
  const ordered = [...result.images].sort((a, b) => b.byteLength - a.byteLength);
  for (const image of ordered) {
    const refs = image.labels.length ? image.labels.join('<br>') : '**未被引用**';
    const embeddedMark = image.embedded ? '`data URI`<br>' : '';
    const alphaText = !image.alpha ? '无' : image.alphaUsed ? '有·用到' : '有·未用';
    lines.push(
      `| ${image.index} | ${image.format} | ${image.width}×${image.height} | ${image.byteLength > 1024 * 1024 ? mb(image.byteLength) : kb(image.byteLength)} | ${alphaText} | ${embeddedMark}${refs} | ${RISK_LABEL[image.risk]} |`,
    );
  }
  const duplicates = new Map();
  for (const image of result.images) {
    if (!image.hash) continue;
    if (!duplicates.has(image.hash)) duplicates.set(image.hash, []);
    duplicates.get(image.hash).push(image.index);
  }
  const repeated = [...duplicates.values()].filter((group) => group.length > 1);
  if (repeated.length) {
    lines.push('', `重复贴图：${repeated.map((group) => group.join(' = ')).join('；')}`);
  }
}

writeFileSync(mdPath, `${lines.join('\n')}\n`, 'utf8');
for (const result of results) {
  const name = result.file.split(/[\\/]/).pop();
  const total = result.images.reduce((sum, image) => sum + image.byteLength, 0);
  console.log(`\n${name}: ${mb(result.bufferSize)}，贴图 ${result.images.length} 张 ${mb(total)}`);
  for (const image of [...result.images].sort((a, b) => b.byteLength - a.byteLength).slice(0, 6)) {
    console.log(
      `  #${image.index} ${image.format} ${image.width}×${image.height} ${image.byteLength > 1024 * 1024 ? mb(image.byteLength) : kb(image.byteLength)} alpha=${image.alpha ? (image.alphaUsed ? 'used' : 'unused') : 'none'} ${image.labels[0] ?? '未引用'} → ${RISK_LABEL[image.risk]}`,
    );
  }
}
console.log(`\n清单已写入 ${mdPath}`);
