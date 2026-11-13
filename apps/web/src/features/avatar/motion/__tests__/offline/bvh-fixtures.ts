/** 离线 BVH 管线测试的共享夹具与断言辅助 */

export const BVH = `HIERARCHY
ROOT Hips
{
  OFFSET 0 90 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Spine
  {
    OFFSET 0 20 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT Neck
    {
      OFFSET 0 20 0
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT Head
      {
        OFFSET 0 10 0
        CHANNELS 3 Zrotation Xrotation Yrotation
        End Site { OFFSET 0 5 0 }
      }
    }
  }
}
MOTION
Frames: 2
Frame Time: 0.0333333
0 90 0 0 0 0  0 0 0  0 0 0  0 0 0
0 90 0 0 0 0  0 0 0  0 0 0  0 0 30
`;

/** 复用上面的层级，替换成 count 帧、每帧头绕 Y 转 i 度的长序列 */
export function withFrames(count: number, frameTime: number): string {
  const header = BVH.slice(0, BVH.indexOf('MOTION'));
  const rows = Array.from({ length: count }, (_, i) => `0 90 0 0 0 0  0 0 0  0 0 0  0 0 ${i}`);
  return `${header}MOTION\nFrames: ${count}\nFrame Time: ${frameTime}\n${rows.join('\n')}\n`;
}

/** 复用层级，生成每帧 Hips 绕 Y 转 i 度的序列（模拟 CMU 片段里的转身） */
export function withHipsYaw(count: number, frameTime: number): string {
  const header = BVH.slice(0, BVH.indexOf('MOTION'));
  const rows = Array.from({ length: count }, (_, i) => `0 90 0 0 0 ${i}  0 0 0  0 0 0  0 0 0`);
  return `${header}MOTION\nFrames: ${count}\nFrame Time: ${frameTime}\n${rows.join('\n')}\n`;
}

type VrmaResult = { json: Record<string, any>; bin: Buffer };

/** 读取某个骨骼最后一条采样四元数 */
export function lastQuat(result: VrmaResult, bone: string): number[] {
  const { json, bin } = result;
  const node = json.extensions.VRMC_vrm_animation.humanoid.humanBones[bone].node;
  const channel = json.animations[0].channels.find(
    (item: { target: { node: number } }) => item.target.node === node,
  );
  const accessor = json.accessors[json.animations[0].samplers[channel.sampler].output];
  const view = json.bufferViews[accessor.bufferView];
  const values = new Float32Array(bin.buffer, bin.byteOffset + view.byteOffset, accessor.count * 4);
  return Array.from(values.slice(values.length - 4));
}

/** 读取某个骨骼最后一条平移采样（没有平移轨道时返回 null） */
export function lastVec3(result: VrmaResult, bone: string): number[] | null {
  const { json, bin } = result;
  const node = json.extensions.VRMC_vrm_animation.humanoid.humanBones[bone].node;
  const channel = json.animations[0].channels.find(
    (item: { target: { node: number; path: string } }) =>
      item.target.node === node && item.target.path === 'translation',
  );
  if (!channel) return null;
  const accessor = json.accessors[json.animations[0].samplers[channel.sampler].output];
  const view = json.bufferViews[accessor.bufferView];
  const values = new Float32Array(bin.buffer, bin.byteOffset + view.byteOffset, accessor.count * 3);
  return Array.from(values.slice(values.length - 3));
}
