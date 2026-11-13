import { createRequire } from 'node:module';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import { describe, expect, it } from 'vitest';
import { BVH, lastQuat, lastVec3, withFrames, withHipsYaw } from './bvh-fixtures';

const require = createRequire(import.meta.url);
const {
  buildVrma,
  parseBvh,
  readGlbJson,
  toGlb,
} = require('../../../../../../../../scripts/motion/bvh-to-vrma.mjs') as {
  buildVrma: (bvh: unknown, options?: Record<string, unknown>) => {
    json: Record<string, any>;
    bin: Buffer;
    stats: { bones: number; frames: number; duration: number; unmapped: string[] };
  };
  parseBvh: (text: string) => Record<string, any>;
  readGlbJson: (buffer: Buffer) => Record<string, any>;
  toGlb: (json: Record<string, unknown>, bin: Buffer) => Buffer;
};

describe('离线 BVH → VRMA 管线', () => {
  it('解析 BVH 层级与帧数据', () => {
    const bvh = parseBvh(BVH);
    expect(bvh.allJoints).toHaveLength(4);
    expect(bvh.frames).toHaveLength(2);
    expect(bvh.channelsPerFrame).toBe(15);
    expect(bvh.frameTime).toBeCloseTo(1 / 30, 5);
  });

  it('生成带 VRMC_vrm_animation 的 VRMA 结构', () => {
    const bvh = parseBvh(BVH);
    const { json, bin, stats } = buildVrma(bvh, { unitScale: 0.01, name: 'test' });
    expect(stats).toMatchObject({ bones: 4, frames: 2 });
    expect(json.extensionsUsed).toContain('VRMC_vrm_animation');
    const extension = json.extensions.VRMC_vrm_animation;
    expect(extension.specVersion).toBe('1.0');
    expect(Object.keys(extension.humanoid.humanBones).sort()).toEqual([
      'head',
      'hips',
      'neck',
      'spine',
    ]);
    expect(json.animations[0].channels.length).toBe(4);

    const glb = toGlb(json, bin);
    const roundTrip = readGlbJson(glb);
    expect(roundTrip.animations[0].channels.length).toBe(4);
  });

  it('头骨第二帧的 Y 旋转写入正确四元数', () => {
    const bvh = parseBvh(BVH);
    const { json, bin } = buildVrma(bvh);
    const extension = json.extensions.VRMC_vrm_animation;
    const headNode = extension.humanoid.humanBones.head.node;
    const channel = json.animations[0].channels.find(
      (item: { target: { node: number } }) => item.target.node === headNode,
    );
    expect(channel).toBeDefined();
    const sampler = json.animations[0].samplers[channel.sampler];
    const accessor = json.accessors[sampler.output];
    const view = json.bufferViews[accessor.bufferView];
    const values = new Float32Array(
      bin.buffer,
      bin.byteOffset + view.byteOffset,
      accessor.count * 4,
    );
    // 第二帧：绕 Y 30° → (0, sin15°, 0, cos15°)
    expect(values[4]).toBeCloseTo(0, 5);
    expect(values[5]).toBeCloseTo(Math.sin(Math.PI / 12), 5);
    expect(values[6]).toBeCloseTo(0, 5);
    expect(values[7]).toBeCloseTo(Math.cos(Math.PI / 12), 5);
  });

  it('内置 CMU 命名映射（LowerBack / Spine1）', () => {
    const cmu = BVH.replace('JOINT Spine', 'JOINT LowerBack').replace('JOINT Neck', 'JOINT Spine1');
    const { json } = buildVrma(parseBvh(cmu));
    const bones = json.extensions.VRMC_vrm_animation.humanoid.humanBones;
    expect(Object.keys(bones).sort()).toEqual(['chest', 'head', 'hips', 'spine']);
  });

  it('--bone-map 支持任意骨骼名', () => {
    const custom = BVH.replace('JOINT Head', 'JOINT J_CustomHead');
    const withoutMap = buildVrma(parseBvh(custom));
    expect(withoutMap.json.extensions.VRMC_vrm_animation.humanoid.humanBones.head).toBeUndefined();
    expect(withoutMap.stats.unmapped).toContain('J_CustomHead');

    const withMap = buildVrma(parseBvh(custom), {
      boneMap: { 'J_CustomHead': 'head' },
    });
    const bones = withMap.json.extensions.VRMC_vrm_animation.humanoid.humanBones;
    expect(bones.head).toBeDefined();
    expect(withMap.stats.unmapped).not.toContain('J_CustomHead');
  });

  it('默认做 A-pose 静息对齐，避免大腿内旋交叉', () => {
    const leg = `HIERARCHY
ROOT Hips
{
  OFFSET 0 90 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT LeftUpLeg
  {
    OFFSET 10 -10 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT LeftLeg
    {
      OFFSET 10 -10 0
      CHANNELS 3 Zrotation Xrotation Yrotation
      End Site { OFFSET 0 -10 0 }
    }
  }
}
MOTION
Frames: 1
Frame Time: 0.0333333
0 90 0 0 0 0  0 0 0  0 0 0
`;
    const bvh = parseBvh(leg);
    const [x = 1, y = 1, z = 0, w = 0] = lastQuat(buildVrma(bvh), 'leftUpperLeg');
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(0, 5);
    expect(z).toBeCloseTo(Math.sin(Math.PI / 8), 5); // 大腿外张 45° 的一半
    expect(w).toBeCloseTo(Math.cos(Math.PI / 8), 5);

    const [rx = 1, ry = 1, rz = 1] = lastQuat(buildVrma(bvh, { restAlign: false }), 'leftUpperLeg');
    expect(rx).toBeCloseTo(0, 5);
    expect(ry).toBeCloseTo(0, 5);
    expect(rz).toBeCloseTo(0, 5);
  });

  it('子关节零 offset 不会破坏静息对齐四元数', () => {
    const zero = BVH.replaceAll('OFFSET 0 20 0', 'OFFSET 0 0 0');
    const [x = 0, y = 0, z = 0, w = 0] = lastQuat(buildVrma(parseBvh(zero)), 'hips');
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(0, 5);
    expect(z).toBeCloseTo(0, 5);
    expect(w).toBeCloseTo(1, 5);
  });

  it('--ground 把最低脚点压到地面', () => {
    const leg = `HIERARCHY
ROOT Hips
{
  OFFSET 0 90 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT LeftUpLeg
  {
    OFFSET 0 -10 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT LeftLeg
    {
      OFFSET 0 -10 0
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT LeftFoot
      {
        OFFSET 0 -10 0
        CHANNELS 3 Zrotation Xrotation Yrotation
        End Site { OFFSET 0 -5 0 }
      }
    }
  }
}
MOTION
Frames: 2
Frame Time: 0.0333333
0 90 0 0 0 0  0 0 0  0 0 0  0 0 0
0 90 0 0 0 0  0 0 0  0 0 0  0 0 0
`;
    const bvh = parseBvh(leg);
    expect(lastVec3(buildVrma(bvh), 'hips')).toBeNull();

    const [x = 1, y = 0, z = 1] = lastVec3(buildVrma(bvh, { ground: true }), 'hips') ?? [];
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(0.3, 5); // 脚在 hips 下方 30（源单位 cm）→ 抬高 0.3m
    expect(z).toBeCloseTo(0, 5);
  });

  it('能被运行时同一个 VRMA loader 解析', async () => {
    const bvh = parseBvh(BVH);
    const { json, bin } = buildVrma(bvh);
    const glb = toGlb(json, bin);
    const buffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    const gltf = await new Promise<Record<string, any>>((resolve, reject) => {
      loader.parse(buffer, '', resolve, reject);
    });
    const animations = gltf.userData.vrmAnimations;
    expect(animations).toHaveLength(1);
    expect(animations[0].humanoidTracks.rotation.get('head')).toBeDefined();
    expect(animations[0].duration).toBeCloseTo(1 / 30, 5);
  });

  it('--fps 降采样并把时间轴归零', () => {
    const bvh = parseBvh(withFrames(120, 1 / 120));
    const { json, stats } = buildVrma(bvh, { fps: 30 });
    expect(stats.frames).toBe(30);
    expect(stats.duration).toBeCloseTo(1, 5);
    const headNode = json.extensions.VRMC_vrm_animation.humanoid.humanBones.head.node;
    const channel = json.animations[0].channels.find(
      (item: { target: { node: number } }) => item.target.node === headNode,
    );
    const input = json.accessors[json.animations[0].samplers[channel.sampler].input];
    expect(input.count).toBe(30);
    expect(input.min[0]).toBe(0);
    expect(input.max[0]).toBeCloseTo(29 / 30, 5);
  });

  it('--lock-yaw 把 Hips 朝向锁回正前方', () => {
    const bvh = parseBvh(withHipsYaw(30, 1 / 30));
    const withTurn = lastQuat(buildVrma(bvh), 'hips');
    expect(Math.abs(withTurn[1] ?? 0)).toBeGreaterThan(0.2); // 29° → y≈0.25

    const [x = 1, y = 1, z = 1, w = 0] = lastQuat(buildVrma(bvh, { lockYaw: true }), 'hips');
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(0, 5);
    expect(z).toBeCloseTo(0, 5);
    expect(Math.abs(w)).toBeCloseTo(1, 5);
  });

  it('--range 按秒裁剪且首帧对齐', () => {
    const bvh = parseBvh(withFrames(120, 1 / 120));
    const { json, bin, stats } = buildVrma(bvh, { fps: 30, range: [0.5, 1] });
    expect(stats.frames).toBe(15);
    expect(stats.duration).toBeCloseTo(0.5, 5);
    const headNode = json.extensions.VRMC_vrm_animation.humanoid.humanBones.head.node;
    const channel = json.animations[0].channels.find(
      (item: { target: { node: number } }) => item.target.node === headNode,
    );
    const sampler = json.animations[0].samplers[channel.sampler];
    const accessor = json.accessors[sampler.output];
    const view = json.bufferViews[accessor.bufferView];
    const values = new Float32Array(
      bin.buffer,
      bin.byteOffset + view.byteOffset,
      accessor.count * 4,
    );
    // 0.5s 处对应源第 60 帧：头绕 Y 60° → (0, sin30°, 0, cos30°)
    expect(values[1]).toBeCloseTo(Math.sin(Math.PI / 6), 5);
    expect(values[3]).toBeCloseTo(Math.cos(Math.PI / 6), 5);
  });
});
