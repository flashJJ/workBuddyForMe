import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import {
  TOUCH_SQUASH_MS,
  TOUCH_SQUASH_SCALE_X,
  TOUCH_SQUASH_SCALE_Y,
} from '@wbfm/shared/constants';

/**
 * 触摸 squash 包络（从 VrmPoseLayer 外迁）：在 fit 之后的基础 scale 上叠加形变。
 * 由姿态层在 Step 2 调用；基础 scale 在 fitVrmToCamera 之后重新 capture。
 */
export class VrmSquash {
  private start = 0;
  private readonly baseScale = new THREE.Vector3();

  constructor(private readonly vrm: VRM) {}

  captureBase(): void {
    this.baseScale.copy(this.vrm.scene.scale);
  }

  play(): void {
    this.start = performance.now();
  }

  update(): void {
    if (this.start === 0) return;
    const t = (performance.now() - this.start) / TOUCH_SQUASH_MS;
    if (t >= 1) {
      this.start = 0;
      this.vrm.scene.scale.copy(this.baseScale);
      return;
    }
    const envelope = Math.sin(t * Math.PI);
    const sx = 1 + (TOUCH_SQUASH_SCALE_X - 1) * envelope;
    const sy = 1 - (1 - TOUCH_SQUASH_SCALE_Y) * envelope;
    this.vrm.scene.scale.set(
      this.baseScale.x * sx,
      this.baseScale.y * sy,
      this.baseScale.z,
    );
  }
}
