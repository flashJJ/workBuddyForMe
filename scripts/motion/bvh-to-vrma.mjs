#!/usr/bin/env node
/**
 * 离线动作管线：BVH → VRMA（M0d）。
 *
 * 用途：把 Mixamo / CMU 等来源的 BVH 转成项目现有的 VRMA 动作池格式，
 * 运行时不引入任何新依赖，仍由 @pixiv/three-vrm-animation 播放。
 *
 * 前提：源 BVH 为 T-pose（Mixamo 默认）。BVH 的 rest 旋转按 0 处理，
 * 直接作为 VRMA 的局部旋转；A-pose 源请先在 Blender 里转 T-pose 再导出。
 * CMU 素材常在片段里转身（Hips 带 Y 轴漂移），加 --lock-yaw 可把朝向锁回正前方，
 * 否则桌宠播放时会一直「打转」；源为 A-pose（如 CMU 大腿外张）时会默认做静息对齐，
 * 避免双腿内旋交叉，确需原样套用旋转时加 --no-rest-align。
 *
 * 用法：
 *   node scripts/motion/bvh-to-vrma.mjs <input.bvh> <output.vrma> [--unit-scale 0.01] [--root-motion] [--lock-yaw] [--no-rest-align] [--ground] [--bone-map map.json]
 *
 * 骨骼映射：
 * - 内置 Mixamo / CMU 常见命名；
 * - 其他来源用 --bone-map 传 JSON：{ "源骨骼名": "vrmHumanBoneName" }。
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** VRM humanoid 父子关系（只列转换会用到的骨骼） */
const VRM_PARENT = {
  hips: null,
  spine: 'hips',
  chest: 'spine',
  upperChest: 'chest',
  neck: 'upperChest',
  head: 'neck',
  leftShoulder: 'upperChest',
  leftUpperArm: 'leftShoulder',
  leftLowerArm: 'leftUpperArm',
  leftHand: 'leftLowerArm',
  rightShoulder: 'upperChest',
  rightUpperArm: 'rightShoulder',
  rightLowerArm: 'rightUpperArm',
  rightHand: 'rightLowerArm',
  leftUpperLeg: 'hips',
  leftLowerLeg: 'leftUpperLeg',
  leftFoot: 'leftLowerLeg',
  leftToes: 'leftFoot',
  rightUpperLeg: 'hips',
  rightLowerLeg: 'rightUpperLeg',
  rightFoot: 'rightLowerLeg',
  rightToes: 'rightFoot',
};

for (const side of ['left', 'right']) {
  const thumb = [`${side}ThumbMetacarpal`, `${side}ThumbProximal`, `${side}ThumbDistal`];
  VRM_PARENT[thumb[0]] = `${side}Hand`;
  VRM_PARENT[thumb[1]] = thumb[0];
  VRM_PARENT[thumb[2]] = thumb[1];
  for (const finger of ['Index', 'Middle', 'Ring', 'Little']) {
    const chain = [`${side}${finger}Proximal`, `${side}${finger}Intermediate`, `${side}${finger}Distal`];
    VRM_PARENT[chain[0]] = `${side}Hand`;
    VRM_PARENT[chain[1]] = chain[0];
    VRM_PARENT[chain[2]] = chain[1];
  }
}

/** 姿态重定向用的子骨骼链：骨骼方向 = 该子关节相对它的 offset */
const CHAIN_CHILD = {
  hips: 'spine',
  spine: 'chest',
  chest: 'upperChest',
  upperChest: 'neck',
  neck: 'head',
  leftShoulder: 'leftUpperArm',
  leftUpperArm: 'leftLowerArm',
  leftLowerArm: 'leftHand',
  rightShoulder: 'rightUpperArm',
  rightUpperArm: 'rightLowerArm',
  rightLowerArm: 'rightHand',
  leftUpperLeg: 'leftLowerLeg',
  leftLowerLeg: 'leftFoot',
  leftFoot: 'leftToes',
  rightUpperLeg: 'rightLowerLeg',
  rightLowerLeg: 'rightFoot',
  rightFoot: 'rightToes',
};

/** VRM 归一化骨架的 T-pose 骨骼方向（用于消除源骨架 A-pose 的静息差） */
const VRM_REST_DIR = {
  hips: [0, 1, 0],
  spine: [0, 1, 0],
  chest: [0, 1, 0],
  upperChest: [0, 1, 0],
  neck: [0, 1, 0],
  head: [0, 1, 0],
  leftShoulder: [1, 0, 0],
  leftUpperArm: [1, 0, 0],
  leftLowerArm: [1, 0, 0],
  leftHand: [1, 0, 0],
  rightShoulder: [-1, 0, 0],
  rightUpperArm: [-1, 0, 0],
  rightLowerArm: [-1, 0, 0],
  rightHand: [-1, 0, 0],
  leftUpperLeg: [0, -1, 0],
  leftLowerLeg: [0, -1, 0],
  leftFoot: [0, 0, 1],
  leftToes: [0, 0, 1],
  rightUpperLeg: [0, -1, 0],
  rightLowerLeg: [0, -1, 0],
  rightFoot: [0, 0, 1],
  rightToes: [0, 0, 1],
};

/** 归一化名字：去 mixamorig 前缀、标点与大小写 */
function normalize(name) {
  return name.toLowerCase().replace(/^mixamorig/, '').replace(/[^a-z0-9]/g, '');
}

/** 常见 BVH 命名 → VRM humanoid 名；键为 normalize 后的名字 */
const ALIASES = new Map();
function alias(bone, names) {
  for (const name of names) ALIASES.set(normalize(name), bone);
}

alias('hips', ['Hips', 'Hip', 'Pelvis']);
alias('spine', ['Spine', 'LowerBack', 'Spine0']);
alias('chest', ['Chest', 'Spine1', 'UpperBack']);
alias('upperChest', ['UpperChest', 'Spine2']);
alias('neck', ['Neck', 'Neck1']);
alias('head', ['Head']);
alias('leftShoulder', ['LeftShoulder', 'LShoulder', 'LeftCollar']);
alias('leftUpperArm', ['LeftArm', 'LeftUpperArm', 'LArm']);
alias('leftLowerArm', ['LeftForeArm', 'LeftLowerArm', 'LForeArm']);
alias('leftHand', ['LeftHand', 'LHand']);
alias('rightShoulder', ['RightShoulder', 'RShoulder', 'RightCollar']);
alias('rightUpperArm', ['RightArm', 'RightUpperArm', 'RArm']);
alias('rightLowerArm', ['RightForeArm', 'RightLowerArm', 'RForeArm']);
alias('rightHand', ['RightHand', 'RHand']);
alias('leftUpperLeg', ['LeftUpLeg', 'LeftThigh', 'LeftUpperLeg', 'LThigh']);
alias('leftLowerLeg', ['LeftLeg', 'LeftShin', 'LeftLowerLeg', 'LShin']);
alias('leftFoot', ['LeftFoot', 'LFoot']);
alias('leftToes', ['LeftToeBase', 'LeftToes', 'LToe']);
alias('rightUpperLeg', ['RightUpLeg', 'RightThigh', 'RightUpperLeg', 'RThigh']);
alias('rightLowerLeg', ['RightLeg', 'RightShin', 'RightLowerLeg', 'RShin']);
alias('rightFoot', ['RightFoot', 'RFoot']);
alias('rightToes', ['RightToeBase', 'RightToes', 'RToe']);

const FINGER_ALIAS = {
  thumb: ['Thumb'],
  index: ['Index'],
  middle: ['Middle'],
  ring: ['Ring'],
  little: ['Pinky', 'Little'],
};
for (const side of ['Left', 'Right']) {
  const vrmSide = side.toLowerCase();
  for (const [finger, names] of Object.entries(FINGER_ALIAS)) {
    const vrmFinger = finger[0].toUpperCase() + finger.slice(1);
    for (const name of names) {
      alias(`${vrmSide}${vrmFinger}Metacarpal`, [`${side}Hand${name}1`, `${side}${name}1`]);
      alias(`${vrmSide}${vrmFinger}Proximal`, [`${side}Hand${name}2`, `${side}${name}2`]);
      alias(`${vrmSide}${vrmFinger}Intermediate`, [`${side}Hand${name}3`, `${side}${name}3`]);
      alias(`${vrmSide}${vrmFinger}Distal`, [`${side}Hand${name}4`, `${side}${name}4`]);
    }
  }
}
// 四指没有 metacarpal：Mixamo 的 1/2/3 对应 proximal/intermediate/distal
for (const side of ['Left', 'Right']) {
  const vrmSide = side.toLowerCase();
  for (const [finger, names] of Object.entries(FINGER_ALIAS)) {
    if (finger === 'thumb') continue;
    const vrmFinger = finger[0].toUpperCase() + finger.slice(1);
    for (const name of names) {
      alias(`${vrmSide}${vrmFinger}Proximal`, [`${side}Hand${name}1`, `${side}${name}1`]);
      alias(`${vrmSide}${vrmFinger}Intermediate`, [`${side}Hand${name}2`, `${side}${name}2`]);
      alias(`${vrmSide}${vrmFinger}Distal`, [`${side}Hand${name}3`, `${side}${name}3`]);
    }
  }
}

/** BVH 解析：返回关节树 + 帧数据（不依赖任何第三方库） */
export function parseBvh(text) {
  const tokens = text.replace(/\r/g, '').split(/\s+/).filter(Boolean);
  let index = 0;
  const next = () => tokens[index++];
  const rootJoints = [];
  const allJoints = [];
  let frameTime = 1 / 30;
  let frames = [];
  let channelsPerFrame = 0;

  function parseJoint(type, parent) {
    const name = next();
    if (next() !== '{') throw new Error(`BVH 关节 ${name} 缺少 {`);
    const joint = { name, type, offset: [0, 0, 0], channels: [], children: [], parent, frameOffset: 0 };
    allJoints.push(joint);
    if (parent) parent.children.push(joint);
    else rootJoints.push(joint);

    for (;;) {
      const token = next();
      if (token === '}') break;
      if (token === 'OFFSET') {
        joint.offset = [Number(next()), Number(next()), Number(next())];
      } else if (token === 'CHANNELS') {
        const count = Number(next());
        joint.frameOffset = channelsPerFrame;
        for (let i = 0; i < count; i += 1) joint.channels.push(next());
        channelsPerFrame += count;
      } else if (token === 'JOINT') {
        parseJoint('JOINT', joint);
      } else if (token === 'End') {
        if (next() !== 'Site') throw new Error('BVH End Site 格式错误');
        // End Site 的 OFFSET 不参与动画，直接跳过
        if (next() !== '{') throw new Error('BVH End Site 缺少 {');
        while (next() !== '}') {
          // skip
        }
      } else {
        throw new Error(`BVH 未知 token: ${token}`);
      }
    }
    return joint;
  }

  for (;;) {
    const token = next();
    if (token === undefined) break;
    if (token === 'HIERARCHY') continue;
    if (token === 'ROOT') {
      parseJoint('ROOT', null);
    } else if (token === 'MOTION') {
      break;
    }
  }

  if (next() === 'Frames:') {
    const count = Number(next());
    if (next() === 'Frame') {
      next(); // Time:
      frameTime = Number(next());
    }
    const values = [];
    for (let i = 0; i < count * channelsPerFrame; i += 1) values.push(Number(next()));
    for (let i = 0; i < count; i += 1) {
      frames.push(values.slice(i * channelsPerFrame, (i + 1) * channelsPerFrame));
    }
  }

  return { rootJoints, allJoints, frameTime, frames, channelsPerFrame };
}

/* ------------------------------- 四元数 ------------------------------- */

function qMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function axisQuat(axis, angle) {
  const half = angle / 2;
  const s = Math.sin(half);
  if (axis === 'x') return [s, 0, 0, Math.cos(half)];
  if (axis === 'y') return [0, s, 0, Math.cos(half)];
  return [0, 0, s, Math.cos(half)];
}

function channelsToQuat(values, channels, offset) {
  let q = [0, 0, 0, 1];
  for (let i = 0; i < channels.length; i += 1) {
    const channel = channels[i];
    if (!channel.endsWith('rotation')) continue;
    q = qMul(q, axisQuat(channel[0].toLowerCase(), (values[offset + i] * Math.PI) / 180));
  }
  return q;
}

/** 去掉绕世界 Y 轴的朝向：`q' = Ry(-yaw) * q`，保留俯仰/侧倾与肢体动作 */
function lockYawQuat(q) {
  const yaw = Math.atan2(2 * (q[3] * q[1] + q[0] * q[2]), 1 - 2 * (q[1] * q[1] + q[2] * q[2]));
  return qMul(axisQuat('y', -yaw), q);
}

/** 四元数旋转向量 */
function rotateVec(q, v) {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  const ix = w * vx + y * vz - z * vy;
  const iy = w * vy + z * vx - x * vz;
  const iz = w * vz + x * vy - y * vx;
  const iw = -x * vx - y * vy - z * vz;
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

/**
 * 逐帧做一次前向运动学，取双脚（脚掌/脚趾）的最低点。
 * 返回值是「相对 hips 原点」的高度（源单位），用于把整段动作贴到地面。
 */
function collectFootHeights(bvh, mappedJoints, frames) {
  const targets = ['leftFoot', 'rightFoot', 'leftToes', 'rightToes']
    .map((bone) => mappedJoints.get(bone))
    .filter(Boolean);
  if (targets.length === 0) return null;
  const targetSet = new Set(targets);
  const heights = [];
  for (const frame of frames) {
    const found = new Map();
    const walk = (joint, parentQ, parentPos) => {
      const q = qMul(parentQ, channelsToQuat(frame, joint.channels, joint.frameOffset));
      // 根关节（hips）视为原点：贴地只看「相对 hips」的脚底高度
      let pos = [0, 0, 0];
      if (parentPos) {
        const offset = rotateVec(parentQ, joint.offset);
        pos = [parentPos[0] + offset[0], parentPos[1] + offset[1], parentPos[2] + offset[2]];
      }
      if (targetSet.has(joint)) found.set(joint, pos[1]);
      for (const child of joint.children) walk(child, q, pos);
    };
    for (const root of bvh.rootJoints) walk(root, [0, 0, 0, 1], null);
    let lowest = Infinity;
    for (const joint of targets) {
      const y = found.get(joint);
      if (y !== undefined) lowest = Math.min(lowest, y);
    }
    heights.push(Number.isFinite(lowest) ? lowest : 0);
  }
  return heights;
}

/** 从方向 a 转到方向 b 的最短弧四元数；任一侧为零向量时退回单位四元数 */
function quatFromTo(a, b) {
  const la = Math.hypot(a[0], a[1], a[2]);
  const lb = Math.hypot(b[0], b[1], b[2]);
  if (la < 1e-9 || lb < 1e-9) return [0, 0, 0, 1];
  const ax = a[0] / la, ay = a[1] / la, az = a[2] / la;
  const bx = b[0] / lb, by = b[1] / lb, bz = b[2] / lb;
  const dot = ax * bx + ay * by + az * bz;
  if (dot > 0.999999) return [0, 0, 0, 1];
  if (dot < -0.999999) {
    const ref = Math.abs(ax) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const cx = ay * ref[2] - az * ref[1];
    const cy = az * ref[0] - ax * ref[2];
    const cz = ax * ref[1] - ay * ref[0];
    const len = Math.hypot(cx, cy, cz) || 1;
    return [cx / len, cy / len, cz / len, 0];
  }
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  const s = Math.sqrt((1 + dot) * 2);
  return [cx / s, cy / s, cz / s, s / 2];
}

/* ------------------------------ 转换 ------------------------------ */

function collectRestPositions(bvh, unitScale) {
  const map = new Map();
  const walk = (joint, parentPos) => {
    const pos = [
      parentPos[0] + joint.offset[0] * unitScale,
      parentPos[1] + joint.offset[1] * unitScale,
      parentPos[2] + joint.offset[2] * unitScale,
    ];
    map.set(joint, pos);
    for (const child of joint.children) walk(child, pos);
  };
  for (const root of bvh.rootJoints) walk(root, [0, 0, 0]);
  return map;
}

function buildHumanoidNodes(mappedJoints, restPositions) {
  const names = Object.keys(VRM_PARENT).filter((name) => mappedJoints.has(name));
  const indexOf = new Map(names.map((name, i) => [name, i]));
  const nodes = names.map((name) => {
    const parent = nearestParent(name, indexOf, mappedJoints);
    const joint = mappedJoints.get(name);
    const pos = restPositions.get(joint);
    const parentPos = parent ? restPositions.get(mappedJoints.get(parent)) : [0, 0, 0];
    return {
      name,
      translation: [pos[0] - parentPos[0], pos[1] - parentPos[1], pos[2] - parentPos[2]],
      children: [],
    };
  });
  for (const [name, i] of indexOf) {
    const parent = nearestParent(name, indexOf, mappedJoints);
    if (parent) nodes[indexOf.get(parent)].children.push(i);
  }
  return { nodes, indexOf };
}

function nearestParent(name, indexOf, mappedJoints) {
  let parent = VRM_PARENT[name];
  while (parent && !(mappedJoints.has(parent) && indexOf.has(parent))) parent = VRM_PARENT[parent];
  return parent ?? null;
}

/**
 * 按时间窗 / 目标帧率挑帧。
 * - 不传 fps：沿用源帧率，只做时间窗裁剪；
 * - 传 fps：按 1/fps 网格就近取源帧（CMU 是 120fps，降采样无插值损失）；
 * - 时间统一从 0 开始，方便同一动作被多次截取复用。
 */
function selectFrames(bvh, fps, range) {
  const total = bvh.frames.length;
  const endTime = total * bvh.frameTime;
  const start = Math.max(0, Math.min(endTime, range?.[0] ?? 0));
  const end = Math.max(0, Math.min(endTime, range?.[1] ?? endTime));
  if (end <= start) throw new Error('--range 结束时间必须大于开始时间');

  if (!fps) {
    const from = Math.min(total - 1, Math.floor(start / bvh.frameTime));
    const to = Math.max(from + 1, Math.min(total, Math.ceil(end / bvh.frameTime)));
    const frames = bvh.frames.slice(from, to);
    return { frames, times: frames.map((_, i) => (from + i) * bvh.frameTime - start) };
  }

  const count = Math.max(1, Math.round((end - start) * fps));
  const frames = [];
  const times = [];
  for (let i = 0; i < count; i += 1) {
    const t = start + i / fps;
    frames.push(bvh.frames[Math.min(total - 1, Math.round(t / bvh.frameTime))]);
    times.push(t - start);
  }
  return { frames, times };
}

/** 生成 VRMA 的 glTF JSON + BIN（未压缩 GLB 的 payload） */
export function buildVrma(bvh, options = {}) {
  const unitScale = options.unitScale ?? 0.01;
  const includeRootMotion = options.rootMotion ?? false;
  const lockYaw = options.lockYaw ?? false;
  const restAlign = options.restAlign ?? true;
  const ground = options.ground ?? false;
  const extraMap = options.boneMap
    ? new Map(Object.entries(options.boneMap).map(([name, bone]) => [normalize(name), bone]))
    : null;

  const resolveBone = (name) => {
    const bone = extraMap?.get(normalize(name)) ?? ALIASES.get(normalize(name));
    return bone && Object.prototype.hasOwnProperty.call(VRM_PARENT, bone) ? bone : null;
  };

  const mappedJoints = new Map();
  const unmapped = [];
  for (const joint of bvh.allJoints) {
    const bone = resolveBone(joint.name);
    if (bone && !mappedJoints.has(bone)) mappedJoints.set(bone, joint);
    else if (!bone) unmapped.push(joint.name);
  }
  if (!mappedJoints.has('hips')) throw new Error('BVH 未找到 hips/hip/pelvis 根关节');

  /**
   * 静息姿态差：源骨架多为 A-pose（大腿外张），VRM 归一化骨架是 T-pose（大腿竖直）。
   * 直接套用源旋转会把「A→竖直」的补偿也算进去，导致双腿内旋交叉。
   * 先算「VRM 静息方向 → 源静息方向」的最短弧，右乘到每帧旋转上，方向即可对齐。
   */
  const restAlignQuats = new Map();
  if (restAlign) {
    for (const bone of mappedJoints.keys()) {
      const childBone = CHAIN_CHILD[bone];
      const childJoint = childBone ? mappedJoints.get(childBone) : null;
      const targetDir = VRM_REST_DIR[bone];
      if (!childJoint || !targetDir) continue;
      restAlignQuats.set(bone, quatFromTo(targetDir, childJoint.offset));
    }
  }

  const restPositions = collectRestPositions(bvh, unitScale);
  const { nodes, indexOf } = buildHumanoidNodes(mappedJoints, restPositions);
  if (nodes.length === 0) throw new Error('BVH 没有可映射到 VRM humanoid 的骨骼');

  const { frames, times } = selectFrames(
    bvh,
    options.fps && options.fps > 0 ? options.fps : null,
    options.range ?? null,
  );
  const footHeights = ground ? collectFootHeights(bvh, mappedJoints, frames) : null;
  // 贴地基准：把 hips 节点的静息高度写成「整段的平均髋高」，
  // three-vrm 会用 humanoidY / restHipsPosition.y 做比例换算，静息高度为 0 会除零。
  const groundBase = footHeights
    ? (-footHeights.reduce((sum, h) => sum + h, 0) / footHeights.length) * unitScale
    : 0;
  if (footHeights) {
    const hipsIndex = indexOf.get('hips');
    if (hipsIndex !== undefined) nodes[hipsIndex].translation = [0, groundBase, 0];
  }
  const channels = [];
  const samplers = [];
  const accessors = [];
  const bufferViews = [];
  const chunks = [];
  let binOffset = 0;

  function pushAccessor(values, type, componentsPerElement, minMax = false) {
    const byteLength = values.length * 4;
    const bufferViewIndex = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: binOffset, byteLength });
    chunks.push(Buffer.from(new Float32Array(values).buffer));
    binOffset += byteLength;
    const accessor = {
      bufferView: bufferViewIndex,
      componentType: 5126,
      count: values.length / componentsPerElement,
      type,
    };
    if (minMax) {
      accessor.min = [Math.min(...values)];
      accessor.max = [Math.max(...values)];
    }
    accessors.push(accessor);
    return accessors.length - 1;
  }

  const inputAccessor = pushAccessor(times, 'SCALAR', 1, true);

  for (const [bone, joint] of mappedJoints) {
    const nodeIndex = indexOf.get(bone);
    if (nodeIndex === undefined) continue;
    const rotationOffset = joint.channels.findIndex((channel) => channel.endsWith('rotation'));
    if (rotationOffset >= 0) {
      const values = [];
      for (const frame of frames) {
        let q = channelsToQuat(frame, joint.channels, joint.frameOffset);
        const align = restAlignQuats.get(bone);
        if (align) q = qMul(q, align);
        if (bone === 'hips' && options.lockYaw) q = lockYawQuat(q);
        values.push(...q);
      }
      const outputAccessor = pushAccessor(values, 'VEC4', 4);
      samplers.push({ input: inputAccessor, output: outputAccessor, interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node: nodeIndex, path: 'rotation' } });
    }
    if (bone === 'hips' && (includeRootMotion || footHeights)) {
      const positionChannels = joint.channels.filter((channel) => channel.endsWith('position'));
      const hasRootPos = includeRootMotion && positionChannels.length >= 3;
      const values = [];
      for (let i = 0; i < frames.length; i += 1) {
        const frame = frames[i];
        let x = 0;
        let y = 0;
        let z = 0;
        if (hasRootPos) {
          const byAxis = new Map(
            joint.channels
              .map((channel, idx) => ({ channel, value: frame[joint.frameOffset + idx] }))
              .filter((item) => item.channel.endsWith('position'))
              .map((item) => [item.channel[0].toLowerCase(), item.value]),
          );
          x = (byAxis.get('x') ?? 0) * unitScale;
          y = (byAxis.get('y') ?? 0) * unitScale;
          z = (byAxis.get('z') ?? 0) * unitScale;
        }
        // 贴地：最低脚点压到 y=0（footHeights 为相对 hips 原点的高度）
        if (footHeights) y -= (footHeights[i] ?? 0) * unitScale;
        values.push(x, y, z);
      }
      const outputAccessor = pushAccessor(values, 'VEC3', 3);
      samplers.push({ input: inputAccessor, output: outputAccessor, interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node: nodeIndex, path: 'translation' } });
    }
  }

  if (channels.length === 0) throw new Error('BVH 没有可用旋转通道');

  const humanBones = {};
  for (const [bone, node] of indexOf) humanBones[bone] = { node };

  const rootIndex = indexOf.get('hips');
  const json = {
    asset: { version: '2.0', generator: 'wbfm-bvh-to-vrma' },
    extensionsUsed: ['VRMC_vrm_animation'],
    extensions: {
      VRMC_vrm_animation: {
        specVersion: '1.0',
        humanoid: { humanBones },
      },
    },
    scene: 0,
    scenes: [{ nodes: [rootIndex] }],
    nodes,
    animations: [{ name: options.name ?? 'bvh', channels, samplers }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: binOffset }],
  };
  return {
    json,
    bin: Buffer.concat(chunks),
    stats: {
      bones: mappedJoints.size,
      frames: frames.length,
      duration: frames.length * (options.fps > 0 ? 1 / options.fps : bvh.frameTime),
      unmapped,
    },
  };
}

/** glTF JSON + BIN → GLB Buffer */
export function toGlb(json, bin) {
  let jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  if (jsonPad) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);
  const binPad = (4 - (bin.length % 4)) % 4;
  const binBytes = binPad ? Buffer.concat([bin, Buffer.alloc(binPad)]) : bin;
  const total = 12 + 8 + jsonBytes.length + 8 + binBytes.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBytes.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(out, 20);
  const offset = 20 + jsonBytes.length;
  out.writeUInt32LE(binBytes.length, offset);
  out.writeUInt32LE(0x004e4942, offset + 4);
  binBytes.copy(out, offset + 8);
  return out;
}

/** 读取 GLB 的 JSON chunk（测试/校验用） */
export function readGlbJson(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error('不是 GLB 文件');
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.includes('--help')) {
    console.log(
      '用法: node scripts/motion/bvh-to-vrma.mjs <input.bvh> <output.vrma> [--unit-scale 0.01] [--fps 30] [--range 开始秒:结束秒] [--root-motion] [--lock-yaw] [--no-rest-align] [--ground] [--bone-map map.json]',
    );
    process.exit(args.length < 2 ? 1 : 0);
  }
  const unitScaleIndex = args.indexOf('--unit-scale');
  const unitScale = unitScaleIndex >= 0 ? Number(args[unitScaleIndex + 1]) : 0.01;
  const mapIndex = args.indexOf('--bone-map');
  let boneMap = null;
  if (mapIndex >= 0) {
    const mapPath = args[mapIndex + 1];
    if (!mapPath) throw new Error('--bone-map 缺少 JSON 路径');
    boneMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  }
  const source = fs.readFileSync(args[0], 'utf8');
  const bvh = parseBvh(source);
  const fpsIndex = args.indexOf('--fps');
  const fps = fpsIndex >= 0 ? Number(args[fpsIndex + 1]) : null;
  const rangeIndex = args.indexOf('--range');
  let range = null;
  if (rangeIndex >= 0) {
    const [from, to] = String(args[rangeIndex + 1] ?? '')
      .split(':')
      .map(Number);
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      throw new Error('--range 格式应为 开始秒:结束秒，例如 --range 4:7');
    }
    range = [from, to];
  }
  const { json, bin, stats } = buildVrma(bvh, {
    unitScale: Number.isFinite(unitScale) && unitScale > 0 ? unitScale : 0.01,
    rootMotion: args.includes('--root-motion'),
    lockYaw: args.includes('--lock-yaw'),
    restAlign: !args.includes('--no-rest-align'),
    ground: args.includes('--ground'),
    boneMap,
    fps: Number.isFinite(fps) && fps > 0 ? fps : null,
    range,
    name: path.basename(args[0], path.extname(args[0])),
  });
  const glb = toGlb(json, bin);
  fs.mkdirSync(path.dirname(args[1]), { recursive: true });
  fs.writeFileSync(args[1], glb);
  console.log(
    `[bvh] ${args[0]} → ${args[1]} | ${stats.bones} 骨骼 / ${stats.frames} 帧 / ${stats.duration.toFixed(2)}s / ${glb.length} bytes`,
  );
  if (stats.unmapped.length > 0) {
    console.log(
      `[bvh] 未映射 ${stats.unmapped.length} 个关节: ${stats.unmapped.slice(0, 12).join(', ')}${stats.unmapped.length > 12 ? ' …' : ''}`,
    );
    console.log('[bvh] 可用 --bone-map map.json 补充映射（源骨骼名 → VRM humanoid 名）');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
