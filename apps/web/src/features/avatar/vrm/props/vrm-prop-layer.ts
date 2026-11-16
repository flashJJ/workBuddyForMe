import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applyPropAnimation } from './prop-animation-apply';
import type { PropAnimationId } from './prop-animation';
import { PROPS, type PropRegistry, type PropSpec } from './prop-manifest';

/**
 * 道具层（S2 手持 / S4 场景）：
 * - hand 挂 raw hand 骨，随角色动作；
 * - stage 挂渲染场景根节点，不跟随拎起/呼吸；
 * - GLB 只加载一次并留在池里，attach/detach/show/hide 只改变父节点。
 *
 * 不参与动效库的骨骼合成；持物手型由 `VrmPoseLayer.applyPropHold` 应用，
 * 帧台账以 `prop:hold` 记录持物手区域。
 */

export interface PropHold {
  hand: 'left' | 'right';
  /** 持物姿态 pose id（手臂 + 手指） */
  pose: string;
}

interface AttachedProp {
  id: string;
  object: THREE.Object3D;
  parent: THREE.Object3D;
  hold: PropHold | null;
  animation?: PropAnimationId;
  elapsedMs: number;
  baseQuaternion: THREE.Quaternion;
}

export interface PropDebugSnapshot {
  ids: string[];
  pending: string[];
  hold: PropHold | null;
}

/** 资产加载器可注入，单测无需真的解析 GLB */
export interface PropAssetLoader {
  load(url: string): Promise<THREE.Object3D>;
}

class GltfPropLoader implements PropAssetLoader {
  private readonly loader = new GLTFLoader();

  async load(url: string): Promise<THREE.Object3D> {
    const gltf = await this.loader.loadAsync(url);
    return gltf.scene;
  }
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) for (const item of material) item.dispose();
    else material?.dispose();
  });
}

export class VrmPropLayer {
  private readonly attached = new Map<string, AttachedProp>();
  /** hand 道具：已请求的持物手型；加载期间也生效 */
  private readonly requested = new Map<string, PropHold>();
  /** stage 道具：已请求显示；hide 可取消尚未完成的加载 */
  private readonly stageRequested = new Set<string>();
  /** GLB 对象池：只加载一次，卸下后仍保留供复用 */
  private readonly loaded = new Map<string, THREE.Object3D>();
  private readonly loading = new Map<string, Promise<THREE.Object3D>>();
  private readonly loader: PropAssetLoader;
  private readonly getProps: () => PropRegistry;
  private disposed = false;

  /**
   * @param stage 渲染场景根节点（不是 vrm.scene）；stage 道具挂这里
   * @param prepare 挂手持道具前把角色摆到持物姿态
   */
  constructor(
    private readonly vrm: VRM,
    private readonly stage: THREE.Object3D,
    private readonly prepare?: () => void,
    loader?: PropAssetLoader, getProps?: () => PropRegistry,
  ) {
    this.loader = loader ?? new GltfPropLoader();
    this.getProps = getProps ?? (() => PROPS);
  }

  get hold(): PropHold | null {
    for (const hold of this.requested.values()) return hold;
    return null;
  }

  get debug(): PropDebugSnapshot {
    const pending = [...new Set([...this.requested.keys(), ...this.stageRequested])].filter(
      (id) => !this.attached.has(id),
    );
    return { ids: [...this.attached.keys()], pending, hold: this.hold };
  }

  /** 手持道具：加载并挂到 rightHand raw bone */
  async attach(id: string): Promise<boolean> {
    const spec = this.getProps()[id];
    if (!spec || spec.kind !== 'hand') return false;
    if (this.attached.has(id) || this.requested.has(id)) return true;

    const hold: PropHold = { hand: 'right', pose: spec.handPose ?? 'pose.prop-hold' };
    this.requested.set(id, hold);
    try {
      const object = await this.load(id, spec);
      if (this.disposed || !this.requested.has(id)) return false;
      if (this.attached.has(id)) return true;
      return this.mountHand(id, spec, object, hold);
    } catch (error) {
      this.requested.delete(id);
      console.warn('[VrmPropLayer] 道具加载失败:', spec.url, error);
      return false;
    }
  }

  /** 场景道具：加载并挂到渲染场景根节点 */
  async show(id: string): Promise<boolean> {
    const spec = this.getProps()[id];
    if (!spec || spec.kind !== 'stage') return false;
    if (this.attached.has(id)) return true;

    this.stageRequested.add(id);
    try {
      const object = await this.load(id, spec);
      if (this.disposed || !this.stageRequested.has(id) || this.attached.has(id)) return false;
      this.mountStage(id, spec, object);
      return true;
    } catch (error) {
      this.stageRequested.delete(id);
      console.warn('[VrmPropLayer] 场景道具加载失败:', spec.url, error);
      return false;
    }
  }

  detach(id: string): boolean {
    const cancelled = this.requested.delete(id);
    return this.release(id) || cancelled;
  }

  hide(id: string): boolean {
    const cancelled = this.stageRequested.delete(id);
    return this.release(id) || cancelled;
  }

  /** 与角色共用同一 dt；在 vrm.update 之后、render 之前调用 */
  update(dtMs: number): void {
    for (const prop of this.attached.values()) {
      if (!prop.animation) continue;
      prop.elapsedMs += dtMs;
      applyPropAnimation(prop.object, prop.baseQuaternion, prop.animation, prop.elapsedMs);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.requested.clear();
    this.stageRequested.clear();
    for (const prop of this.attached.values()) prop.parent.remove(prop.object);
    this.attached.clear();
    for (const object of this.loaded.values()) disposeObject(object);
    this.loaded.clear();
    this.loading.clear();
  }

  private release(id: string): boolean {
    const prop = this.attached.get(id);
    if (!prop) return false;
    prop.parent.remove(prop.object);
    this.attached.delete(id);
    return true;
  }

  private load(id: string, spec: PropSpec): Promise<THREE.Object3D> {
    const cached = this.loaded.get(id);
    if (cached) return Promise.resolve(cached);
    const existing = this.loading.get(id);
    if (existing) return existing;

    const promise = this.loader.load(spec.url).then(
      (object) => {
        this.loading.delete(id);
        if (this.disposed) {
          disposeObject(object);
          throw new Error('disposed');
        }
        this.loaded.set(id, object);
        return object;
      },
      (error) => {
        this.loading.delete(id);
        throw error;
      },
    );
    this.loading.set(id, promise);
    return promise;
  }

  private mountHand(
    id: string,
    spec: PropSpec,
    object: THREE.Object3D,
    hold: PropHold,
  ): boolean {
    const humanoid = this.vrm.humanoid;
    const hand = humanoid?.getRawBoneNode('rightHand');
    const middle = humanoid?.getRawBoneNode('rightMiddleProximal');
    if (!hand || !middle) {
      this.requested.delete(id);
      return false;
    }

    this.prepare?.();
    humanoid?.update();
    this.vrm.scene.updateMatrixWorld(true);

    // 掌心取「腕 → 中指根」的中点偏指根；再沿掌心法线与掌侧向让出道具原点。
    const handPos = hand.getWorldPosition(new THREE.Vector3());
    const middlePos = middle.getWorldPosition(new THREE.Vector3());
    const palm = handPos.lerp(middlePos, 0.55);
    const normHand = humanoid?.getNormalizedBoneNode('rightHand');
    const palmNormal = new THREE.Vector3(0, 0, 1);
    if (normHand) {
      palmNormal
        .set(0, -1, 0)
        .applyQuaternion(normHand.getWorldQuaternion(new THREE.Quaternion()));
    }
    palm.addScaledVector(palmNormal.normalize(), spec.contact ?? 0.03);
    const lateral = new THREE.Vector3().crossVectors(palmNormal, new THREE.Vector3(0, 1, 0));
    if (lateral.lengthSq() > 1e-6) {
      palm.addScaledVector(lateral.normalize(), spec.lateral ?? 0);
    }

    object.position.copy(hand.worldToLocal(palm.clone()));
    const worldQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      spec.yaw ?? 0,
    );
    object.quaternion.copy(
      hand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(worldQuat),
    );
    object.scale.setScalar(spec.scale ?? 1);
    object.name = `wbfm-prop-${id}`;
    if (spec.animation === 'pour') this.ensurePourStream(object);
    hand.add(object);
    this.attached.set(id, {
      id,
      object,
      parent: hand,
      hold,
      animation: spec.animation,
      elapsedMs: 0,
      baseQuaternion: object.quaternion.clone(),
    });
    return true;
  }

  private ensurePourStream(object: THREE.Object3D): void {
    if (object.getObjectByName('wbfm-pour-stream')) return;
    const material = new THREE.MeshBasicMaterial({
      color: 0x7fc8ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const stream = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.0015, 0.16, 8, 1, true),
      material,
    );
    stream.name = 'wbfm-pour-stream';
    stream.position.set(-0.04, -0.04, 0);
    stream.visible = false;
    object.add(stream);
  }

  private mountStage(id: string, spec: PropSpec, object: THREE.Object3D): void {
    object.position.fromArray(spec.position ?? [0, 0, 0]);
    object.rotation.set(0, spec.rotationY ?? 0, 0);
    object.scale.setScalar(spec.scale ?? 1);
    object.name = `wbfm-prop-${id}`;
    this.stage.add(object);
    this.attached.set(id, {
      id,
      object,
      parent: this.stage,
      hold: null,
      animation: spec.animation,
      elapsedMs: 0,
      baseQuaternion: object.quaternion.clone(),
    });
  }
}
