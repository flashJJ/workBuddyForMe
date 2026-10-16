'use client';

import * as React from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';
import { parseVrmAvatarId } from '@wbfm/shared/schemas';
import { getManagedToken } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n/use-i18n';

export type { VRM };

/** 8 表情 → VRM 预设映射（用户决策：disgust→angry / fear→sad / smirk→surprised） */
const VRM_EXPRESSION_MAP: Record<string, string> = {
  joy: 'happy',
  sadness: 'sad',
  anger: 'angry',
  neutral: 'relaxed',
  surprise: 'surprised',
  disgust: 'angry',
  fear: 'sad',
  smirk: 'surprised',
};

export interface VrmCanvasProps {
  modelId: string;
  speaking?: boolean;
  /** TTS 播放电平读取器（与 Live2dCanvas 同口径） */
  getLevel?: () => number;
  expression?: string | null;
  /** Live2D 专用：controllerRef / onHeadTouch / motionGroup，VRM 忽略 */
  controllerRef?: React.MutableRefObject<unknown | null>;
  onHeadTouch?: () => void;
  motionAction?: string | null;
  motionGroup?: string;
  className?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
}

interface VrmRuntime {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  vrm: VRM;
  clock: THREE.Clock;
  breathePhase: number;
  targetRotation: { x: number; y: number };
  currentRotation: { x: number; y: number };
  /** 待机动画 mixer（用户导入的 VRM 通常自带 Idle/Loop 动画 clip） */
  idleMixer: THREE.AnimationMixer | null;
}

/**
 * VRM 形象渲染组件（three.js）
 * 与 Live2dCanvas 同口径 props，外部无感知。
 */
export function VrmCanvas({
  modelId,
  speaking = false,
  getLevel,
  expression = null,
  className,
  style,
  'data-testid': testId,
}: VrmCanvasProps) {
  const { t } = useI18n();
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const runtimeRef = React.useRef<VrmRuntime | null>(null);
  const speakingRef = React.useRef(speaking);
  const getLevelRef = React.useRef(getLevel);
  const expressionRef = React.useRef(expression);
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);
  React.useEffect(() => {
    getLevelRef.current = getLevel;
  }, [getLevel]);
  React.useEffect(() => {
    expressionRef.current = expression;
  }, [expression]);

  const fileRef = parseVrmAvatarId(modelId);
  console.log('[VRM] VrmCanvas mount, modelId=', modelId, 'fileRef=', fileRef);
  React.useEffect(() => {
    if (!fileRef || !hostRef.current) return;

    let disposed = false;
    const host = hostRef.current;

    const runtime = initVrm(host);
    runtimeRef.current = runtime;
    const token = getManagedToken();
    const vrmUrl = token
      ? `/api/vrm-avatars/${fileRef}/file?token=${encodeURIComponent(token)}`
      : `/api/vrm-avatars/${fileRef}/file`;
    console.log('[VRM] GLTFLoader loading:', vrmUrl);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      vrmUrl,
      (gltf) => {
        if (disposed) return;
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) {
          setError('VRM 解析失败');
          return;
        }
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        vrm.scene.traverse((o) => {
          o.frustumCulled = false;
        });
        runtime.scene.add(vrm.scene);
        runtime.vrm = vrm;
        fitVrmToCamera(vrm, runtime.camera);

        // 尝试播内置待机动画（glTF.animations 里通常有 Idle/Loop clip；
        // 只有 T Pose 静态姿势的 VRM 继续 fallback 到呼吸浮动）
        console.log('[VRM] gltf.animations count =', gltf.animations?.length ?? 0);
        if (gltf.animations && gltf.animations.length > 0) {
          gltf.animations.forEach((clip, i) => {
            console.log(`[VRM]   clip[${i}] name="${clip.name}" duration=${clip.duration}s tracks=${clip.tracks?.length ?? 0}`);
          });
          // 优先选名字带 idle/loop/待机动的 clip，否则拿最长的
          const sorted = [...gltf.animations].sort((a, b) => b.duration - a.duration);
          const idleClip = gltf.animations.find((a) => /idle|loop|待机/i.test(a.name)) ?? sorted[0];
          if (idleClip) {
            console.log('[VRM] choosing clip:', idleClip.name, 'duration=', idleClip.duration);
            runtime.idleMixer = new THREE.AnimationMixer(vrm.scene);
            const action = runtime.idleMixer.clipAction(idleClip);
            action.play();
          }
        } else {
          console.warn('[VRM] glTF 里没找到任何 animation clip（纯静态/无内嵌动作）');
        }

        setReady(true);
      },
      undefined,
      (err) => {
        if (!disposed) setError(err instanceof Error ? err.message : String(err));
      },
    );

    const onPointerMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      runtime.targetRotation.x = ((e.clientY - r.top) / r.height - 0.5) * -0.5;
      runtime.targetRotation.y = ((e.clientX - r.left) / r.width - 0.5) * 0.8;
    };
    host.addEventListener('pointermove', onPointerMove);

    let raf = 0;
    const animate = () => {
      if (disposed) return;
      raf = requestAnimationFrame(animate);
      const dt = runtime.clock.getDelta();
      const tNow = runtime.clock.elapsedTime;
      // AnimationMixer 先驱动骨骼 → VRM.update(dt) 再把 Humanoid/FK 同步到场景
      runtime.idleMixer?.update(dt);
      runtime.currentRotation.x += (runtime.targetRotation.x - runtime.currentRotation.x) * 0.12;
      runtime.currentRotation.y += (runtime.targetRotation.y - runtime.currentRotation.y) * 0.12;
      if (runtime.vrm) {
        runtime.vrm.scene.rotation.x = runtime.currentRotation.x;
        runtime.vrm.scene.rotation.y = runtime.currentRotation.y;
        runtime.vrm.update(dt);
        // 口型
        const em = runtime.vrm.expressionManager;
        if (em) {
          const level = getLevelRef.current?.() ?? 0;
          const target = speakingRef.current ? Math.min(1, level * 3.2) : 0;
          em.setValue('aa', target);
          // 表情
          const expr = expressionRef.current;
          const preset = expr ? VRM_EXPRESSION_MAP[expr] ?? 'relaxed' : 'relaxed';
          for (const name of ['happy', 'sad', 'angry', 'relaxed', 'surprised']) {
            em.setValue(name, name === preset ? 1 : 0);
          }
        }
        // 呼吸浮动（替代摸头弹性）
        runtime.breathePhase += dt;
        const breathe = Math.sin(runtime.breathePhase * 1.2) * 0.02;
        runtime.vrm.scene.position.y = breathe;
      }
      runtime.renderer.render(runtime.scene, runtime.camera);
    };
    animate();

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w > 0 && h > 0) resizeVrm(runtime, w, h);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      host.removeEventListener('pointermove', onPointerMove);
      disposeVrm(runtime);
      runtimeRef.current = null;
    };
  }, [fileRef]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={hostRef}
        className={className ? `h-full w-full ${className}` : 'h-full w-full'}
        style={style}
        data-testid={testId}
      />
      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/5 text-xs text-muted-foreground">
          {t('avatar.stage.loading')}
        </div>
      )}
      {error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/5 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

function initVrm(container: HTMLElement): VrmRuntime {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 1.3, 2.2);
  camera.lookAt(0, 1, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const dir = new THREE.DirectionalLight(0xffffff, 1.5);
  dir.position.set(1, 2, 2);
  scene.add(dir);
  const grid = new THREE.GridHelper(10, 10, 0x888888, 0x444444);
  grid.visible = false;
  scene.add(grid);
  return {
    scene,
    camera,
    renderer,
    vrm: null as unknown as VRM,
    clock: new THREE.Clock(),
    breathePhase: 0,
    targetRotation: { x: 0, y: 0 },
    currentRotation: { x: 0, y: 0 },
    idleMixer: null as THREE.AnimationMixer | null,
  };
}

function fitVrmToCamera(vrm: VRM, camera: THREE.PerspectiveCamera) {
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = (camera.fov * Math.PI) / 180;
  const distance = (maxDim / 2 / Math.tan(fov / 2)) * 1.8;
  camera.position.set(center.x, center.y, center.z + distance);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

function resizeVrm(runtime: VrmRuntime, w: number, h: number) {
  runtime.renderer.setSize(w, h);
  runtime.camera.aspect = w / h;
  runtime.camera.updateProjectionMatrix();
}

function disposeVrm(runtime: VrmRuntime) {
  runtime.idleMixer?.stopAllAction();
  if (runtime.vrm) {
    VRMUtils.deepDispose(runtime.vrm.scene);
  }
  runtime.renderer.dispose();
  runtime.renderer.forceContextLoss();
  runtime.renderer.domElement.remove();
}
