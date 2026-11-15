import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import type { MotionMood } from '@wbfm/shared/schemas';
import { resolveBuiltinVrmAsset } from '@wbfm/shared/constants';
import { getManagedToken } from '@/lib/api/client';
import type { ExpressionTag } from '../../expression/expression-parser';
import { shouldRenderFrame, type FrameMode } from '../../performance/frame-governor';
import { projectObjectToViewport, type AvatarScreenRect } from '../../performance/screen-rect';
import { attachGazePointer } from '../../performance/pointer-gaze';
import { loadMotionPool, loadRotationConfig } from '../vrm-motion-loader';
import { createCanvasFit } from '../vrm-fit';
import { installVrmDebugProbe, removeVrmDebugProbe, type VrmDebugProbe } from '../vrm-debug';
import { VrmController } from '../vrm-controller';
import { releaseVrmModel } from './release-model';

export interface VrmSessionRuntime {
  speaking: boolean;
  level: () => number;
  mood: MotionMood;
  relationshipLevel: number;
  frameMode: FrameMode;
  sleeping: boolean;
  faceAway: boolean;
  expression: ExpressionTag | null;
  /** 表情强度（1 轻 / 2 中 / 3 强；模型挂载时生效） */
  expressionIntensity: 1 | 2 | 3;
  /** 舞台相对位置朝向（弧度；模型挂载时生效） */
  stageFacing: number;
  /** v3.0 P4：Q 版比例（新模型挂载时立即生效） */
  chibi: boolean;
  /** v3.0 M4：展示面（舞台/小剧场）只用内置待机，避免导入动作轮播造成怪异姿态 */
  builtinIdleOnly: boolean;
}

export interface VrmSessionDeps {
  host: HTMLElement;
  getPetSize: () => 'sm' | 'md' | 'lg';
  /** 桌宠路由：脚底贴底 + 头顶余量；主窗保持居中 */
  isPet?: () => boolean;
  getRuntime: () => VrmSessionRuntime;
  onController: (controller: VrmController | null) => void;
  onReady: (ready: boolean) => void;
  onError: (message: string | null) => void;
  onModelRect: (rect: AvatarScreenRect | null) => void;
  onFrame?: (dtMs: number) => void;
}

interface ActiveModel {
  vrm: VRM;
  controller: VrmController;
  pool: THREE.AnimationClip[];
  probe: VrmDebugProbe | null;
}

export interface VrmSession {
  loadModel(fileRef: string): Promise<void>;
  /** 容器尺寸变化：同步 renderer / canvas / camera.aspect，并按需重新取景 */
  resize(): void;
  /** 比例变化（桌宠档位 / Q 版）：尺寸不变，只重新取景 */
  refit(): void;
  resources(): { geometries: number; textures: number; programs: number };
  dispose(): void;
}

/** 模型地址：内置模型走静态资源，导入模型走受 token 守卫的 API */
function resolveModelUrl(fileRef: string): string {
  const builtin = resolveBuiltinVrmAsset(fileRef);
  if (builtin) return builtin;
  const token = getManagedToken();
  return `/api/vrm-avatars/${fileRef}/file${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

/**
 * VRM 渲染会话：renderer/scene/相机/rAF 只建一次，换模型只换模型子树。
 *
 * 与旧实现的差别：换模型不再触发 React cleanup 销毁 renderer（那会闪黑帧）；
 * 新模型完全就绪后才同步释放旧模型，rAF 不会看到「空场景」的中间态。
 */
export function createVrmSession(deps: VrmSessionDeps): VrmSession {
  const { host } = deps;
  let disposed = false;
  let swapToken = 0;
  let active: ActiveModel | null = null;
  let raf = 0;
  let lastFrameAt = 0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.set(0, 1.2, 2.5);
  camera.lookAt(0, 1, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const dir = new THREE.DirectionalLight(0xffffff, 1.5);
  dir.position.set(1, 2, 2);
  scene.add(dir);

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

  const resources = () => ({
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? 0,
  });

  const release = (model: ActiveModel | null) => {
    if (!model) return;
    releaseVrmModel({
      controller: model.controller,
      vrm: model.vrm,
      probe: model.probe,
      scene,
      hooks: {
        removeProbe: removeVrmDebugProbe,
        deepDispose: (target) => VRMUtils.deepDispose(target),
      },
    });
    if (active === model) active = null;
  };

  const fit = createCanvasFit({
    host,
    camera,
    renderer,
    getVrm: () => active?.vrm ?? null,
    getController: () => active?.controller ?? null,
    getPetSize: deps.getPetSize,
    isPet: deps.isPet,
    onFit: (w, h, result) => {
      const current = active;
      if (!current) return;
      if (current.probe) current.probe.fit = result;
      // Q 版缩腿后取景比例沿用动作池并集，脚底要按新骨架再贴一次地
      if (deps.getRuntime().chibi) current.controller.alignFeetToGround();
      current.controller.captureBaseScale();
      deps.onModelRect(projectObjectToViewport(current.vrm.scene, camera, w, h));
    },
  });

  const detachGaze = attachGazePointer(host, () => active?.controller ?? null);

  const animate = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(animate);
    const current = active;
    if (!current) return;
    const runtime = deps.getRuntime();
    if (!shouldRenderFrame(now, lastFrameAt, runtime.frameMode)) return;
    const dtMs = lastFrameAt > 0 ? Math.min(now - lastFrameAt, 100) : 0;
    lastFrameAt = now;
    current.controller.setMotionPreference({
      mood: runtime.mood,
      relationshipLevel: runtime.relationshipLevel,
    });
    current.controller.update(runtime.speaking, runtime.level);
    deps.onFrame?.(dtMs);
  };
  raf = requestAnimationFrame(animate);

  const applyRuntime = (controller: VrmController) => {
    const runtime = deps.getRuntime();
    controller.setSleeping(runtime.sleeping);
    controller.setFaceAway(runtime.faceAway);
    if (runtime.expression) {
      controller.setExpression(runtime.expression, runtime.expressionIntensity);
    }
    controller.setStageFacing(runtime.stageFacing);
    if (runtime.chibi) controller.setChibi(true);
  };

  const installProbe = (model: ActiveModel) => {
    model.probe = installVrmDebugProbe(
      model.vrm,
      camera,
      model.controller,
      model.pool,
      host,
      resources,
    );
  };

  const reportLoadError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    // dev 下保留堆栈：模型加载失败时只显示 message 很难定位
    if (process.env.NODE_ENV !== 'production') console.error('[VrmSession] 模型加载失败', err);
    if (!active) {
      deps.onError(message);
      return;
    }
    // 已有模型继续显示：热替换失败不应该把可用的旧模型打上错误层
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[VrmSession] 热替换失败，保留当前模型:', message);
    }
  };

  const loadModel = async (fileRef: string): Promise<void> => {
    const token = ++swapToken;
    try {
      const gltf = await loader.loadAsync(resolveModelUrl(fileRef));
      if (disposed || token !== swapToken) {
        VRMUtils.deepDispose(gltf.scene);
        return;
      }
      const vrm = (gltf.userData.vrm as VRM | undefined) ?? null;
      if (!vrm) {
        VRMUtils.deepDispose(gltf.scene);
        deps.onError('VRM 解析失败');
        return;
      }

      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.removeUnnecessaryJoints(gltf.scene);
      VRMUtils.rotateVRM0(vrm);
      vrm.scene.traverse((o) => { o.frustumCulled = false; });

      const [poolEntries, rotation] = await Promise.all([
        loadMotionPool(loader, vrm, { builtinOnly: deps.getRuntime().builtinIdleOnly }),
        loadRotationConfig(),
      ]);
      if (disposed || token !== swapToken) {
        VRMUtils.deepDispose(gltf.scene);
        return;
      }

      const controller = new VrmController(
        vrm,
        gltf.animations,
        renderer,
        scene,
        camera,
        poolEntries,
        rotation,
      );
      applyRuntime(controller);
      // 展示面不需要待机余兴（踮脚/插兜/抱臂），并固定一个自然站姿
      if (deps.getRuntime().builtinIdleOnly) {
        controller.setScriptBusy(true);
        controller.setStageStance(true);
      }

      const next: ActiveModel = {
        vrm,
        controller,
        pool: poolEntries.map((entry) => entry.clip),
        probe: null,
      };
      const previous = active;
      // 新模型就绪后再释放旧模型；以下全部同步执行，rAF 不会插入空场景帧
      active = next;
      release(previous);
      scene.add(vrm.scene);
      installProbe(next);
      fit.reset();
      fit.refit();

      deps.onController(controller);
      deps.onError(null);
      deps.onReady(true);
    } catch (err) {
      if (disposed || token !== swapToken) return;
      reportLoadError(err);
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    detachGaze();
    release(active);
    fit.dispose();
    deps.onController(null);
    deps.onModelRect(null);
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };

  return { loadModel, resize: fit.resize, refit: fit.refit, resources, dispose };
}
