import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { computeAnimatedBounds } from './animated-bounds';

/** 采样步长（秒） */
const SAMPLE_STEP = 1 / 60;
/** 采样帧数总上限（控耗时） */
const MAX_SAMPLES = 900;

/**
 * 采样一批 clip 的全程包围盒并集（由 MotionMixer.primeForFit 外迁）。
 *
 * 关键：不能只按「某一条」或「某一帧」的包围盒取景——轮播会比到摆幅更大的动作，
 * 那时按别的动作算出的 scale 会让四肢超出视锥被裁。每条 clip 按时长占比分配采样帧。
 *
 * 调用方负责在调用前停掉当前待机 action、调用后恢复（见 MotionMixer.primeForFit）。
 */
export function sampleAnimatedBounds(
  mixer: THREE.AnimationMixer,
  vrm: VRM,
  clips: THREE.AnimationClip[],
): { min: THREE.Vector3; max: THREE.Vector3 } | null {
  let acc: THREE.Box3 | null = null;
  const sample = () => {
    const bounds = computeAnimatedBounds(vrm.scene);
    if (!bounds.isEmpty()) acc = acc ? acc.union(bounds) : bounds;
  };

  if (clips.length > 0) {
    const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0);
    for (const clip of clips) {
      const action = mixer.clipAction(clip);
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.setEffectiveWeight(1);
      action.play();
      const full = Math.max(12, Math.ceil(clip.duration / SAMPLE_STEP));
      const share =
        totalDuration > 0 ? Math.round((clip.duration / totalDuration) * MAX_SAMPLES) : MAX_SAMPLES;
      const frames = Math.max(12, Math.min(full, share));
      const delta = clip.duration / frames;
      for (let i = 0; i < frames; i++) {
        mixer.update(delta);
        vrm.update(delta);
        sample();
      }
      action.stop();
    }
  } else {
    for (let i = 0; i < 120; i++) {
      vrm.update(SAMPLE_STEP);
      sample();
    }
  }

  if (!acc) return null;
  const box = acc as THREE.Box3;
  return { min: box.min.clone(), max: box.max.clone() };
}
