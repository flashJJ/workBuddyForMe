import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import {
  parseMotionId,
  motionMoodSchema,
  motionSegmentSchema,
  DEFAULT_MOTION_MOOD,
  DEFAULT_MOTION_SEGMENT,
  DEFAULT_VOICE_SETTINGS,
  type MotionAsset,
  type MotionAssetListResponse,
  type MotionMood,
  type MotionSegment,
  type VoiceSettings,
} from '@wbfm/shared/schemas';
import { BUILTIN_IDLE_MOTION_URL } from '@wbfm/shared/constants';
import { apiGet, getManagedToken } from '@/lib/api/client';
import type { MotionRotationConfig } from './vrm-motion-mixer';
import type { MotionPoolEntry } from '../motion/motion-segments';

/**
 * 待机动作池装载（由 VrmCanvas 外迁）。
 *
 * 动作池 = 内置 daiji.vrma（Next 静态托管）+ 用户已导入动作（/api/motions），
 * 选中的导入动作排首位作为初始待机；任一文件加载失败静默跳过。
 *
 * v2.2 M1：除 clip 外同时带上 `segment` / `entryKey` / `mood` / `minRelationshipLevel`
 * 元数据（来自 /api/motions 的 MotionAsset），供 MotionMixer 做三段式调度与档位挑选。
 */

/** 动作池并发加载上限：避免导入很多动作时拖慢启动 */
const MOTION_POOL_LIMIT = 8;

/**
 * 舞台待机剔除的骨骼：腿/脚/脚趾与手指。
 * 内置 daiji 在 VRM0 模型上会抬起小腿、内扣脚掌、屈指，展示面只需要上半身微动。
 * 注意：clip 轨道名用的是模型节点名（如 `Normalized_DEF-Left_leg`），
 * 必须经 humanoid 映射后按节点名剔除，不能直接匹配 humanoid 词表。
 */
const STAGE_IDLE_EXCLUDED_BONES = [
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'leftToes',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'rightToes',
  // 手腕保留：daiji 的腕部轨道负责把掌心转到贴近大腿；剔除后手指会向外摊开
  ...(['left', 'right'] as const).flatMap((side) =>
    ['Thumb', 'Index', 'Middle', 'Ring', 'Little'].flatMap((finger) =>
      ['Metacarpal', 'Proximal', 'Intermediate', 'Distal'].map(
        (segment) => `${side}${finger}${segment}`,
      ),
    ),
  ),
];

function stageIdleClip(
  clip: THREE.AnimationClip,
  vrm: import('@pixiv/three-vrm').VRM,
): THREE.AnimationClip {
  const excluded = new Set<string>();
  for (const bone of STAGE_IDLE_EXCLUDED_BONES) {
    const node = vrm.humanoid?.getNormalizedBoneNode(bone as never);
    if (node) excluded.add(node.name);
  }
  const tracks = clip.tracks.filter((track) => {
    const dot = track.name.lastIndexOf('.');
    return dot <= 0 || !excluded.has(track.name.slice(0, dot));
  });
  return new THREE.AnimationClip('stage-idle', clip.duration, tracks);
}

/** 一条待加载动作的描述（URL + v2.2 元数据） */
interface MotionDescriptor {
  url: string;
  name: string;
  segment: MotionSegment;
  entryKey: string | null;
  mood: MotionMood;
  minRelationshipLevel: number | null;
}

/** 组装动作池：选中的导入动作优先（作为初始待机），内置 daiji 始终入池 */
export async function loadMotionPool(
  loader: GLTFLoader,
  vrm: import('@pixiv/three-vrm').VRM,
  options: { builtinOnly?: boolean } = {},
): Promise<MotionPoolEntry[]> {
  const token = getManagedToken();
  const fileUrl = (fileRef: string) =>
    token
      ? `/api/motions/${fileRef}/file?token=${encodeURIComponent(token)}`
      : `/api/motions/${fileRef}/file`;

  // 内置 daiji：未选中导入动作时即初始待机；无论如何都要在池里
  const builtin: MotionDescriptor = {
    url: BUILTIN_IDLE_MOTION_URL,
    name: 'daiji',
    segment: 'single',
    entryKey: null,
    mood: 'normal',
    minRelationshipLevel: null,
  };

  const descriptors: MotionDescriptor[] = [];
  let selectedRef: string | null = null;
  // 舞台等展示面只取内置待机：用户导入的走/伸展等动作按 8s 轮播会像骨骼扭曲
  if (!options.builtinOnly) {
    try {
      const data = await apiGet<MotionAssetListResponse>('/api/motions');
      selectedRef = parseMotionId(data.selectedId);
      const describe = (motion: MotionAsset): MotionDescriptor => ({
        url: fileUrl(motion.fileRef),
        name: motion.name,
        segment: motion.segment,
        entryKey: motion.entryKey ?? null,
        mood: motion.mood,
        minRelationshipLevel: motion.minRelationshipLevel ?? null,
      });
      if (selectedRef) {
        const selected = data.motions.find((m) => m.fileRef === selectedRef);
        if (selected) descriptors.push(describe(selected));
      }
      for (const motion of data.motions) {
        if (motion.fileRef !== selectedRef) descriptors.push(describe(motion));
      }
    } catch (e) {
      console.warn('[VrmCanvas] 读取待机动作列表失败，仅使用内置动作:', e);
    }
  }

  if (!selectedRef) descriptors.unshift(builtin);
  if (!descriptors.some((d) => d.url === builtin.url)) descriptors.push(builtin);

  // 去重 + 限量；若截断把内置挤掉，则用内置替换末位
  const seen = new Set<string>();
  const targets: MotionDescriptor[] = [];
  for (const descriptor of descriptors) {
    if (targets.length >= MOTION_POOL_LIMIT) break;
    if (seen.has(descriptor.url)) continue;
    seen.add(descriptor.url);
    targets.push(descriptor);
  }
  if (!targets.some((d) => d.url === builtin.url)) targets.splice(targets.length - 1, 1, builtin);

  const entries = await Promise.all(
    targets.map(async (d): Promise<MotionPoolEntry | null> => {
      try {
        const gltf = await loader.loadAsync(d.url);
        const anims = gltf.userData.vrmAnimations as
          | import('@pixiv/three-vrm-animation').VRMAnimation[]
          | undefined;
        if (!anims || anims.length === 0) {
          console.warn('[VrmCanvas] VRMA 里没有动画数据: ' + d.url);
          return null;
        }
        const created = anims[0] ? createVRMAnimationClip(anims[0], vrm) : null;
        if (!created) return null;
        const clip = options.builtinOnly ? stageIdleClip(created, vrm) : created;
        // 读兼容（与 core 的 rowToMotion 同口径）：服务端版本落后/字段缺失或词表外的值一律回落缺省，
        // 绝不因一条动作的坏元数据让整个动作池搭不起来。
        const segment = motionSegmentSchema.safeParse(d.segment);
        const mood = motionMoodSchema.safeParse(d.mood);
        return {
          clip,
          name: d.name,
          segment: segment.success ? segment.data : DEFAULT_MOTION_SEGMENT,
          entryKey: d.entryKey,
          mood: mood.success ? mood.data : DEFAULT_MOTION_MOOD,
          minRelationshipLevel: d.minRelationshipLevel,
        };
      } catch (e) {
        console.warn('[VrmCanvas] VRMA 加载失败，跳过: ' + d.url, e);
        return null;
      }
    }),
  );
  return entries.filter((entry): entry is MotionPoolEntry => entry !== null);
}

/** 读取待机动作轮播配置（失败回落默认值） */
export async function loadRotationConfig(): Promise<MotionRotationConfig> {
  try {
    const settings = await apiGet<VoiceSettings>('/api/voice/settings');
    return {
      enabled: settings.motionRotationEnabled,
      seconds: settings.motionRotationSeconds,
    };
  } catch {
    return {
      enabled: DEFAULT_VOICE_SETTINGS.motionRotationEnabled,
      seconds: DEFAULT_VOICE_SETTINGS.motionRotationSeconds,
    };
  }
}
