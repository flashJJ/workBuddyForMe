/**
 * 生成内置待机动作（原创曲线，CC0）。
 *
 * 只复用 VRMA 1.0 的文件结构与标准 humanoid 节点名，动画曲线全部由本脚本生成：
 * - 8 字形轻微呼吸/重心摆动，幅度远小于原 daiji；
 * - 上臂/前臂按「自然下垂」目标求解局部旋转；
 * - 首尾同相，保证 6 秒无缝循环。
 *
 * 用法：node apps/web/scripts/generate-idle-motion.mjs
 * 输出：apps/web/public/motions/daiji.vrma（保持原文件名，示例包/常量无需改动）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(HERE, '../public/motions/daiji.vrma');
const DEG = Math.PI / 180;

function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('不是 GLB: ' + file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binHeader = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binHeader);
  const binStart = binHeader + 8;
  return { buf, json, bin: buf.subarray(binStart, binStart + binLen), binStart };
}

function layout(json, index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  const comps = { SCALAR: 1, VEC3: 3, VEC4: 4 }[acc.type];
  const compSize = acc.componentType === 5126 ? 4 : 2;
  return {
    acc,
    base: (view.byteOffset || 0) + (acc.byteOffset || 0),
    stride: view.byteStride || comps * compSize,
    comps,
    compSize,
  };
}

function readVecs(json, bin, index) {
  const { acc, base, stride, comps, compSize } = layout(json, index);
  const out = [];
  for (let i = 0; i < acc.count; i += 1) {
    const row = [];
    for (let c = 0; c < comps; c += 1) {
      const at = base + i * stride + c * compSize;
      row.push(acc.componentType === 5126 ? bin.readFloatLE(at) : bin.readUInt16LE(at));
    }
    out.push(row);
  }
  return out;
}

function writeVecs(out, binStart, json, index, values) {
  const { acc, base, stride, comps, compSize } = layout(json, index);
  for (let i = 0; i < acc.count; i += 1) {
    const value = values[i] || values[values.length - 1];
    for (let c = 0; c < comps; c += 1) {
      out.writeFloatLE(value[c] ?? (c === 3 ? 1 : 0), binStart + base + i * stride + c * compSize);
    }
  }
}

function writeGlb(file, buf) {
  // JSON 与 BIN chunk 均已按 4 字节对齐，直接回写；总长度不变
  buf.writeUInt32LE(buf.length, 8);
  fs.writeFileSync(file, buf);
}

function buildRig(json) {
  const objects = json.nodes.map(() => new THREE.Object3D());
  json.nodes.forEach((node, i) => {
    if (node.translation) objects[i].position.fromArray(node.translation);
    if (node.rotation) objects[i].quaternion.fromArray(node.rotation);
    if (node.scale) objects[i].scale.fromArray(node.scale);
  });
  json.nodes.forEach((node, i) => {
    for (const child of node.children || []) objects[i].add(objects[child]);
  });
  const root = new THREE.Object3D();
  for (const i of json.scenes?.[json.scene ?? 0]?.nodes || []) root.add(objects[i]);
  root.updateMatrixWorld(true);
  return { objects, root };
}

function euler(x, y, z) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
}

const { buf, json, bin, binStart } = readGlb(FILE);
const anim = json.animations?.[0];
if (!anim) throw new Error('没有动画数据');
const nodes = json.nodes;
const byName = new Map(nodes.map((node, i) => [node.name, i]));
const { objects } = buildRig(json);
const parentIndex = new Map();
nodes.forEach((node, i) => {
  for (const child of node.children || []) parentIndex.set(child, i);
});

const restOf = (node) => new THREE.Quaternion().fromArray(node.rotation || [0, 0, 0, 1]);

/**
 * 把「归一化空间的世界旋转」换算成源骨架的局部旋转。
 * VRMAnimationLoader 的公式：qNorm = P · A · L⁻¹ · P⁻¹
 * → A = P⁻¹ · qNorm · P · L（P=父骨 rest 世界旋转，L=本骨 rest 局部旋转）
 */
function normalizedToLocal(name, qNorm) {
  const index = byName.get(name);
  if (index == null) return null;
  const parent = parentIndex.get(index);
  const parentQ = new THREE.Quaternion();
  if (parent != null) objects[parent].getWorldQuaternion(parentQ);
  const rest = restOf(nodes[index]);
  return parentQ.clone().invert().multiply(qNorm).multiply(parentQ).multiply(rest);
}

// 手臂目标：上臂向下略外，前臂在肘部再向前弯 10°
const ARM_TARGET = {
  leftUpperArm: new THREE.Vector3(0.16, -1, 0.04).normalize(),
  rightUpperArm: new THREE.Vector3(-0.16, -1, 0.04).normalize(),
};
const ARM_REST = {
  leftUpperArm: new THREE.Vector3(1, 0, 0),
  rightUpperArm: new THREE.Vector3(-1, 0, 0),
};
const LOWER_BEND = {
  leftLowerArm: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, -1, 0), 10 * DEG),
  rightLowerArm: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 10 * DEG),
};

for (const channel of anim.channels) {
  const node = nodes[channel.target.node];
  const sampler = anim.samplers[channel.sampler];
  const times = readVecs(json, bin, sampler.input).map((row) => row[0]);
  const duration = times[times.length - 1] || 1;

  if (channel.target.path === 'translation') {
    if (node.name === 'Hips') {
      // 必须保持常量：VRMA 的髋部平移会按「模型髋高 / 动画髋高」放大数十倍，
      // 这里若写毫米级正弦，运行时就会变成十几厘米的上下漂浮。
      const base = node.translation || [0, 0, 0];
      writeVecs(buf, binStart, json, sampler.output, times.map(() => [base[0], base[1], base[2]]));
    }
    continue;
  }
  if (channel.target.path !== 'rotation') continue;

  const name = node.name || '';
  const key = name.charAt(0).toLowerCase() + name.slice(1);
  const upperArm = key === 'leftUpperArm' || key === 'rightUpperArm';
  const lowerArm = key === 'leftLowerArm' || key === 'rightLowerArm';
  const armBase = upperArm
    ? new THREE.Quaternion().setFromUnitVectors(ARM_REST[key], ARM_TARGET[key])
    : lowerArm
      ? LOWER_BEND[key]
      : null;

  writeVecs(buf, binStart, json, sampler.output, times.map((t) => {
    const u = t / duration;
    const s1 = Math.sin(2 * Math.PI * u);
    const s2 = Math.sin(2 * Math.PI * 2 * u);
    let qNorm = new THREE.Quaternion();
    if (armBase) {
      const phase = key.startsWith('left') ? 0 : Math.PI / 2;
      qNorm = euler(
        Math.sin(2 * Math.PI * u + phase) * 0.7 * DEG,
        Math.sin(2 * Math.PI * u + phase + 0.6) * 0.9 * DEG,
        0,
      ).multiply(armBase);
    } else if (key === 'hips') {
      qNorm = euler(0, s1 * 0.8 * DEG, Math.sin(2 * Math.PI * u + Math.PI / 2) * 0.5 * DEG);
    } else if (key === 'spine') {
      qNorm = euler(0, s1 * -0.8 * DEG, 0);
    } else if (key === 'chest') {
      qNorm = euler(s2 * 0.6 * DEG, 0, 0);
    } else if (key === 'neck') {
      // 轻微低头：侧栏/桌宠相机位于胸口高度，纯中立头会被看成「上仰」
      qNorm = euler(1 * DEG, Math.sin(2 * Math.PI * u + 0.4) * 1.2 * DEG, 0);
    } else if (key === 'head') {
      qNorm = euler(
        2.5 * DEG + s2 * 0.8 * DEG,
        s1 * 2.5 * DEG,
        Math.sin(2 * Math.PI * u + 0.8) * 0.5 * DEG,
      );
    }
    const local = normalizedToLocal(name, qNorm);
    return local ? local.toArray() : restOf(node).toArray();
  }));
}

writeGlb(FILE, buf);
console.log('generated', FILE, fs.statSync(FILE).size, 'bytes');
