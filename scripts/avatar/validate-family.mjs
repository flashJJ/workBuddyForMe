/**
 * AnimeArt 家族校验：确认模型仍可共用 `animeart-v1` binding。
 *
 * 校验项（与 docs/plan/archive/v3/v3.0/pet-engine/bindings/README.md 同口径）：
 * - 49 根 humanoid 骨骼，骨骼集合与基线一致；
 * - 骨骼父级关系与基线一致；
 * - 每根骨骼的 rest 四元数与基线夹角 ≤ 0.5°；
 * - 面部 mesh 每个 primitive 的 morph 数 = binding.morphCount，且 targetNames 与 binding 完全一致；
 * - morph target 只保留 POSITION（精简后不再有 NORMAL/TANGENT）；
 * - VRM 表情 bind 索引集合与 binding 推导出的集合一致（18 个）。
 *
 * 用法：
 *   node scripts/avatar/validate-family.mjs
 *   node scripts/avatar/validate-family.mjs a.vrm b.vrm
 *   node scripts/avatar/validate-family.mjs --baseline x.vrm --binding binding.json --json report.json <files...>
 *
 * 无文件参数时校验仓库内置的三个角色模型。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const MAX_REST_ANGLE_DEG = 0.5;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_BASELINE = path.join(ROOT, 'apps/web/public/vrm/models/xuetuan.vrm');
const DEFAULT_BINDING = path.join(
  ROOT,
  'apps/web/src/features/avatar/animation/bindings/animeart-v1.json',
);
const DEFAULT_FILES = ['xuetuan', 'rankaluli', 'feibi'].map((name) =>
  path.join(ROOT, `apps/web/public/vrm/models/${name}.vrm`),
);

function readGlbJson(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 12 || buf.readUInt32LE(0) !== GLB_MAGIC || buf.readUInt32LE(4) !== 2) {
    throw new Error('不是 glTF 2.0 二进制文件');
  }
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    if (type === JSON_CHUNK) {
      return JSON.parse(buf.subarray(offset + 8, offset + 8 + length).toString('utf8'));
    }
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  throw new Error('GLB 缺少 JSON chunk');
}

function parseArgs(argv) {
  const args = { baseline: DEFAULT_BASELINE, binding: DEFAULT_BINDING, json: null, files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--baseline') args.baseline = path.resolve(argv[(i += 1)]);
    else if (arg === '--binding') args.binding = path.resolve(argv[(i += 1)]);
    else if (arg === '--json') args.json = path.resolve(argv[(i += 1)]);
    else if (arg.startsWith('--')) throw new Error(`未知参数: ${arg}`);
    else args.files.push(path.resolve(arg));
  }
  if (args.files.length === 0) args.files = DEFAULT_FILES;
  return args;
}

function getVrm0(json, file) {
  const vrm = json.extensions?.VRM;
  if (!vrm) throw new Error(`${path.basename(file)} 不是 VRM0（缺少 extensions.VRM）`);
  return vrm;
}

function humanBoneMap(vrm, file) {
  const bones = vrm.humanoid?.humanBones;
  if (!Array.isArray(bones)) throw new Error(`${path.basename(file)} 缺少 humanoid.humanBones`);
  const map = new Map();
  for (const entry of bones) map.set(entry.bone, entry.node);
  return map;
}

function parentMap(json) {
  const parents = new Map();
  json.nodes?.forEach((node, index) => {
    for (const child of node.children ?? []) parents.set(child, index);
  });
  return parents;
}

function nodeQuat(json, index) {
  const q = json.nodes?.[index]?.rotation ?? [0, 0, 0, 1];
  const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((value) => value / length);
}

/** 两个单位四元数的最短夹角（度） */
function quatAngleDeg(a, b) {
  const dot = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
  return (2 * Math.acos(dot) * 180) / Math.PI;
}

function faceMorphInfo(json, vrm, binding, file) {
  const meshIndex = json.meshes?.findIndex((mesh) => mesh.name === binding.mesh);
  if (meshIndex === undefined || meshIndex < 0) {
    throw new Error(`${path.basename(file)} 找不到面部 mesh ${binding.mesh}`);
  }
  const mesh = json.meshes[meshIndex];
  const expectedNames = binding.targets.map((target) => target.name);
  const problems = [];
  let primitiveCount = 0;
  for (const [index, primitive] of mesh.primitives.entries()) {
    const targets = primitive.targets ?? [];
    primitiveCount += 1;
    if (targets.length !== binding.morphCount) {
      problems.push(`primitive[${index}] morph ${targets.length} ≠ ${binding.morphCount}`);
      continue;
    }
    const names = primitive.extras?.targetNames;
    if (!Array.isArray(names) || names.length !== expectedNames.length) {
      problems.push(`primitive[${index}] targetNames 缺失或长度不符`);
    } else if (names.some((name, i) => name !== expectedNames[i])) {
      const first = names.findIndex((name, i) => name !== expectedNames[i]);
      problems.push(`primitive[${index}] targetNames[${first}] ${names[first]} ≠ ${expectedNames[first]}`);
    }
    targets.forEach((target, targetIndex) => {
      const attrs = Object.keys(target);
      if (attrs.some((key) => key !== 'POSITION')) {
        problems.push(`primitive[${index}] target[${targetIndex}] 含非 POSITION 属性 ${attrs.join('+')}`);
      }
    });
  }
  return { meshIndex, primitiveCount, problems };
}

function expressionBindSet(vrm) {
  const groups = vrm.blendShapeMaster?.blendShapeGroups ?? [];
  const binds = new Set();
  for (const group of groups) {
    for (const bind of group.binds ?? []) {
      if (typeof bind.mesh === 'number' && typeof bind.index === 'number') {
        binds.add(`${bind.mesh}/${bind.index}`);
      }
    }
  }
  return binds;
}

function expectedBindSet(binding, meshIndex) {
  const binds = new Set();
  for (const targets of Object.values(binding.standardExpressions ?? {})) {
    for (const target of targets) binds.add(`${meshIndex}/${target.index}`);
  }
  return binds;
}

function diffSets(actual, expected) {
  const missing = [...expected].filter((item) => !actual.has(item));
  const extra = [...actual].filter((item) => !expected.has(item));
  return { missing, extra };
}

/** 骨骼父级名称：父节点也是 humanoid 骨骼时返回骨骼名，否则返回根标记 */
function boneParentNames(json, bones) {
  const nodeToBone = new Map();
  for (const [bone, node] of bones) nodeToBone.set(node, bone);
  const parents = parentMap(json);
  const result = new Map();
  for (const [bone, node] of bones) {
    const parentNode = parents.get(node);
    result.set(bone, parentNode === undefined ? 'ROOT' : (nodeToBone.get(parentNode) ?? 'NON_HUMANOID'));
  }
  return result;
}

function loadBaseline(file) {
  const json = readGlbJson(file);
  const vrm = getVrm0(json, file);
  const bones = humanBoneMap(vrm, file);
  if (bones.size !== 49) throw new Error(`基线 humanoid ${bones.size} 根骨骼，期望 49`);
  return { json, vrm, bones, parents: boneParentNames(json, bones) };
}

function validateFile(file, baseline, binding) {
  const json = readGlbJson(file);
  const vrm = getVrm0(json, file);
  const bones = humanBoneMap(vrm, file);
  const parents = boneParentNames(json, bones);
  const problems = [];

  if (bones.size !== baseline.bones.size) {
    problems.push(`humanoid ${bones.size} 根 ≠ 基线 ${baseline.bones.size}`);
  }
  for (const [bone, node] of baseline.bones) {
    if (!bones.has(bone)) problems.push(`缺少骨骼 ${bone}`);
  }
  for (const [bone] of bones) {
    if (!baseline.bones.has(bone)) problems.push(`多出骨骼 ${bone}`);
  }

  let maxAngle = 0;
  for (const [bone, baseNode] of baseline.bones) {
    const node = bones.get(bone);
    if (node === undefined) continue;
    if (parents.get(bone) !== baseline.parents.get(bone)) {
      problems.push(`${bone} 父级 ${parents.get(bone)} ≠ 基线 ${baseline.parents.get(bone)}`);
    }
    const angle = quatAngleDeg(nodeQuat(json, node), nodeQuat(baseline.json, baseNode));
    maxAngle = Math.max(maxAngle, angle);
    if (angle > MAX_REST_ANGLE_DEG) {
      problems.push(`${bone} rest 夹角 ${angle.toFixed(2)}° > ${MAX_REST_ANGLE_DEG}°`);
    }
  }

  const morph = faceMorphInfo(json, vrm, binding, file);
  problems.push(...morph.problems);

  const actualBinds = expressionBindSet(vrm);
  const expectedBinds = expectedBindSet(binding, morph.meshIndex);
  const bindDiff = diffSets(actualBinds, expectedBinds);
  if (bindDiff.missing.length) problems.push(`表情 bind 缺少 ${bindDiff.missing.join(', ')}`);
  if (bindDiff.extra.length) problems.push(`表情 bind 多出 ${bindDiff.extra.join(', ')}`);

  return {
    file: path.relative(ROOT, file) || file,
    pass: problems.length === 0,
    humanoidBones: bones.size,
    maxRestAngleDeg: Number(maxAngle.toFixed(3)),
    primitives: morph.primitiveCount,
    morphCount: binding.morphCount,
    bindIndices: actualBinds.size,
    problems,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const binding = JSON.parse(fs.readFileSync(args.binding, 'utf8'));
  const baseline = loadBaseline(args.baseline);
  console.log(`基线: ${path.relative(ROOT, args.baseline)}`);
  console.log(`binding: ${path.relative(ROOT, args.binding)} (${binding.family})`);

  const results = args.files.map((file) => validateFile(file, baseline, binding));
  for (const result of results) {
    const mark = result.pass ? 'PASS' : 'FAIL';
    console.log(
      `[${mark}] ${result.file} · ${result.humanoidBones} 骨骼 · rest ≤ ${result.maxRestAngleDeg}° · ` +
        `${result.primitives} primitive × ${result.morphCount} morph · ${result.bindIndices} binds`,
    );
    for (const problem of result.problems.slice(0, 8)) console.log(`       - ${problem}`);
    if (result.problems.length > 8) console.log(`       - ... 其余 ${result.problems.length - 8} 项见报告`);
  }

  if (args.json) {
    fs.mkdirSync(path.dirname(args.json), { recursive: true });
    fs.writeFileSync(
      args.json,
      `${JSON.stringify({ family: binding.family, baseline: path.relative(ROOT, args.baseline), results }, null, 2)}\n`,
    );
    console.log(`报告: ${path.relative(ROOT, args.json)}`);
  }

  const failed = results.filter((result) => !result.pass).length;
  console.log(failed === 0 ? `全部通过（${results.length} 个模型）` : `${failed}/${results.length} 个模型未通过`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main();
