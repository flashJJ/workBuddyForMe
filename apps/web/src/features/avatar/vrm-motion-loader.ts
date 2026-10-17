import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import {
  parseMotionId,
  DEFAULT_VOICE_SETTINGS,
  type MotionAssetListResponse,
  type VoiceSettings,
} from '@wbfm/shared/schemas';
import { BUILTIN_IDLE_MOTION_URL } from '@wbfm/shared/constants';
import { apiGet, getManagedToken } from '@/lib/api/client';
import type { MotionRotationConfig } from './vrm-motion-mixer';

/**
 * 待机动作池装载（由 VrmCanvas 外迁）。
 *
 * 动作池 = 内置 daiji.vrma（Next 静态托管）+ 用户已导入动作（/api/motions），
 * 选中的导入动作排首位作为初始待机；任一文件加载失败静默跳过。
 */

/** 动作池并发加载上限：避免导入很多动作时拖慢启动 */
const MOTION_POOL_LIMIT = 8;

/** 组装动作池：选中的导入动作优先（作为初始待机），内置 daiji 始终入池 */
export async function loadMotionPool(
  loader: GLTFLoader,
  vrm: import('@pixiv/three-vrm').VRM,
): Promise<THREE.AnimationClip[]> {
  const token = getManagedToken();
  const fileUrl = (fileRef: string) =>
    token
      ? `/api/motions/${fileRef}/file?token=${encodeURIComponent(token)}`
      : `/api/motions/${fileRef}/file`;

  const ordered: string[] = [];
  let selectedRef: string | null = null;
  try {
    const data = await apiGet<MotionAssetListResponse>('/api/motions');
    selectedRef = parseMotionId(data.selectedId);
    if (selectedRef) ordered.push(fileUrl(selectedRef));
    for (const motion of data.motions) {
      if (motion.fileRef !== selectedRef) ordered.push(fileUrl(motion.fileRef));
    }
  } catch (e) {
    console.warn('[VrmCanvas] 读取待机动作列表失败，仅使用内置动作:', e);
  }
  // 未选中导入动作时内置 daiji 即初始待机；无论如何内置都要在池里
  if (!selectedRef) ordered.unshift(BUILTIN_IDLE_MOTION_URL);
  if (!ordered.includes(BUILTIN_IDLE_MOTION_URL)) ordered.push(BUILTIN_IDLE_MOTION_URL);

  const targets = [...new Set(ordered)].slice(0, MOTION_POOL_LIMIT);
  if (!targets.includes(BUILTIN_IDLE_MOTION_URL)) {
    targets.splice(targets.length - 1, 1, BUILTIN_IDLE_MOTION_URL);
  }

  const clips = await Promise.all(
    targets.map(async (url) => {
      try {
        const gltf = await loader.loadAsync(url);
        const anims = gltf.userData.vrmAnimations as
          | import('@pixiv/three-vrm-animation').VRMAnimation[]
          | undefined;
        if (!anims || anims.length === 0) {
          console.warn('[VrmCanvas] VRMA 里没有动画数据: ' + url);
          return null;
        }
        return anims[0] ? createVRMAnimationClip(anims[0], vrm) : null;
      } catch (e) {
        console.warn('[VrmCanvas] VRMA 加载失败，跳过: ' + url, e);
        return null;
      }
    }),
  );
  return clips.filter((clip): clip is THREE.AnimationClip => clip !== null);
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
