'use client';

import * as React from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import { parseVrmAvatarId, DEFAULT_MOTION_MOOD, type MotionMood } from '@wbfm/shared/schemas';
import { getManagedToken } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { ExpressionTag } from './expression-parser';
import { loadMotionPool, loadRotationConfig } from './vrm-motion-loader';
import { fitVrmToCamera, type VrmFitResult } from './vrm-fit';
import { VrmController, type VrmControllerLike } from './vrm-controller';

export type { VrmControllerLike };
export type { VRM } from '@pixiv/three-vrm';

export interface VrmCanvasProps {
  modelId: string;
  speaking?: boolean;
  getLevel?: () => number;
  expression?: ExpressionTag | null;
  /** Live2D 已有：传入 TouchControllerLike 实例，PetStage 的 useHeadTouch 会调用它 */
  controllerRef?: React.MutableRefObject<VrmControllerLike | null>;
  /** 是否需要接收鼠标事件（默认 false → 穿透不挡点击；桌宠交互场景显式传 true） */
  interactive?: boolean;
  /** v2.2：情绪档位 / 关系等级（待机动作按档位挑选；缺省 normal / 0） */
  mood?: MotionMood;
  relationshipLevel?: number;
  className?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
}

/** dev 调试钩子（window.__vrmDebug）暴露的形状 */
interface VrmDebugProbe {
  three: typeof THREE;
  vrm: import('@pixiv/three-vrm').VRM;
  camera: THREE.PerspectiveCamera;
  controller: VrmController;
  pool: THREE.AnimationClip[];
  fit: VrmFitResult | null;
  state: () => Record<string, unknown>;
}

export function VrmCanvas({
  modelId,
  speaking = false,
  getLevel,
  expression = null,
  controllerRef,
  interactive = false,
  mood = DEFAULT_MOTION_MOOD,
  relationshipLevel = 0,
  className,
  style,
  'data-testid': testId,
}: VrmCanvasProps) {
  const { t } = useI18n();
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const controllerRefInternal = React.useRef<VrmController | null>(null);
  const speakingRef = React.useRef(speaking);
  const getLevelRef = React.useRef(getLevel);
  const expressionRef = React.useRef(expression);
  const moodRef = React.useRef(mood);
  const relationshipLevelRef = React.useRef(relationshipLevel);
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { speakingRef.current = speaking; }, [speaking]);
  React.useEffect(() => { getLevelRef.current = getLevel; }, [getLevel]);
  React.useEffect(() => { expressionRef.current = expression; }, [expression]);
  React.useEffect(() => { moodRef.current = mood; }, [mood]);
  React.useEffect(() => { relationshipLevelRef.current = relationshipLevel; }, [relationshipLevel]);

  const fileRef = parseVrmAvatarId(modelId);
  React.useEffect(() => {
    if (!fileRef || !hostRef.current) return;
    let disposed = false;
    const host = hostRef.current;

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

    // 提升到顶层——让 useEffect cleanup 能访问
    let controller: VrmController | null = null;
    let vrm: import('@pixiv/three-vrm').VRM | null = null;
    let debug: VrmDebugProbe | null = null;
    let raf = 0;
    let observer: ResizeObserver | null = null;
    let onPointerMove: ((e: PointerEvent) => void) | null = null;

    const token = getManagedToken();
    const vrmUrl = token
      ? `/api/vrm-avatars/${fileRef}/file?token=${encodeURIComponent(token)}`
      : `/api/vrm-avatars/${fileRef}/file`;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

    void (async () => {
      try {
        const gltf = await loader.loadAsync(vrmUrl);
        if (disposed) return;
        vrm = (gltf.userData.vrm as import('@pixiv/three-vrm').VRM | undefined) ?? null;
        if (!vrm) { setError('VRM 解析失败'); return; }

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);
        VRMUtils.rotateVRM0(vrm);

        vrm.scene.traverse((o) => { o.frustumCulled = false; });
        scene.add(vrm.scene);

        // 模型自身不含 AnimationClip（静止姿态就是 T-pose），
        // 加载动作池（内置 daiji + 全部已导入 VRMA）与轮播配置
        const [poolEntries, rotation] = await Promise.all([
          loadMotionPool(loader, vrm),
          loadRotationConfig(),
        ]);
        if (disposed) return;

        controller = new VrmController(
          vrm,
          gltf.animations,
          renderer,
          scene,
          camera,
          poolEntries,
          rotation,
        );
        controllerRefInternal.current = controller;
        if (controllerRef) controllerRef.current = controller;

        // 调试钩子（仅 dev）：MCP/CDP 读取实时缩放/位置/相机/当前待机动作/取景自检结果
        if (process.env.NODE_ENV !== 'production') {
          debug = {
            three: THREE,
            vrm,
            camera,
            controller,
            pool: poolEntries.map((entry) => entry.clip),
            fit: null,
            state: () => ({
              scale: vrm!.scene.scale.toArray(),
              pos: vrm!.scene.position.toArray(),
              cam: camera.position.toArray(),
              host: [host.offsetWidth, host.offsetHeight],
              phase: (controller as any)?.interaction?.currentPhase ?? null,
              idle: (controller as any)?.mixer?.idleClipName ?? null,
              poolSize: (controller as any)?.mixer?.poolSize ?? 0,
              gesture: Boolean((controller as any)?.mixer?.hasGesture),
              holding: Boolean((controller as any)?.mixer?.isHolding),
              clip: (controller as any)?.mixer?.currentClipName ?? null,
            }),
          };
          (window as unknown as Record<string, unknown>).__vrmDebug = debug;
        }

        onPointerMove = (e: PointerEvent) => {
          if (!controller) return;
          const r = host.getBoundingClientRect();
          const nx = (e.clientX - r.left) / r.width * 2 - 1;
          const ny = (e.clientY - r.top) / r.height * 2 - 1;
          controller.setGaze(nx, ny);
        };
        host.addEventListener('pointermove', onPointerMove);

        const animate = () => {
          if (disposed || !controller) return;
          raf = requestAnimationFrame(animate);
          if (expressionRef.current) controller.setExpression(expressionRef.current);
          controller.setMotionPreference({
            mood: moodRef.current,
            relationshipLevel: relationshipLevelRef.current,
          });
          controller.update(speakingRef.current, () => getLevelRef.current?.() ?? 0);
        };
        animate();

        let fitted = false;
        let lastW = 0, lastH = 0;
        // 上一次 fit 时的容器尺寸——容器尺寸变了必须重算 scale
        let fitW = 0, fitH = 0;
        // 整个动作池的包围盒并集（primeForFit 采样一次，后续重 fit 复用）
        let fitBounds: { min: THREE.Vector3; max: THREE.Vector3 } | null = null;
        const resize = () => {
          requestAnimationFrame(() => {
            if (disposed) return;
            const w = host.offsetWidth || host.clientWidth;
            const h = host.offsetHeight || host.clientHeight;
            if (!w || !h) return;
            if (w === lastW && h === lastH) return;
            lastW = w; lastH = h;
            renderer.setSize(w, h, false);
            renderer.domElement.style.width = w + 'px';
            renderer.domElement.style.height = h + 'px';
            renderer.domElement.style.display = 'block';
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            // 只 fit 一次会漏两件事：① 布局未稳定时量到错误容器尺寸；
            // ② 只按单帧包围盒取景，待机动画的大幅摆臂会被裁。
            // 因此：首次 primeForFit 采样「整个动作池」的包围盒并集，之后容器尺寸变了就重 fit。
            let animBounds = fitBounds;
            const sizeChanged = Math.abs(w - fitW) > 2 || Math.abs(h - fitH) > 2;
            if (controller && vrm && (!fitted || sizeChanged)) {
              if (!fitted) {
                animBounds = controller.primeForFit();
                fitBounds = animBounds;
              }
              fitted = true;
              fitW = w; fitH = h;
              const fitResult = fitVrmToCamera(vrm, camera, host, animBounds);
              if (debug) debug.fit = fitResult;
              controller.captureBaseScale();
            }
          });
        };
        observer = new ResizeObserver(resize);
        observer.observe(host);
        resize();

        setReady(true);
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    // 顶层 cleanup——React StrictMode 触发时必调，彻底释放所有资源
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
      if (onPointerMove) host.removeEventListener('pointermove', onPointerMove);
      if (controller) {
        controller.dispose();
        if (controllerRef && controllerRef.current === controller) controllerRef.current = null;
      }
      if (vrm) VRMUtils.deepDispose(vrm.scene);
      if (debug && (window as unknown as Record<string, unknown>).__vrmDebug === debug) {
        delete (window as unknown as Record<string, unknown>).__vrmDebug;
      }
      controllerRefInternal.current = null;
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove(); // 关键！从 DOM 移除 canvas，StrictMode 第二次 setup 才不会叠加
    };
  }, [fileRef]);

  const pointerClass = interactive ? '' : 'pointer-events-none';
  return (
    <div className={`relative h-full w-full ${pointerClass}`}>
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
