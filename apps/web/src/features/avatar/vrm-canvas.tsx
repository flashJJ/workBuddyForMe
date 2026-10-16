'use client';

import * as React from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { parseVrmAvatarId } from '@wbfm/shared/schemas';
import { getManagedToken } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { ExpressionTag } from './expression-parser';
import { VrmController } from './vrm-controller';
import type { VrmControllerLike } from './vrm-controller';

export type { VrmControllerLike };
export type { VRM } from '@pixiv/three-vrm';

export interface VrmCanvasProps {
  modelId: string;
  speaking?: boolean;
  getLevel?: () => number;
  expression?: ExpressionTag | null;
  /** Live2D 已有：传入 TouchControllerLike 实例，PetStage 的 useHeadTouch 会调用它 */
  controllerRef?: React.MutableRefObject<VrmControllerLike | null>;
  className?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
}

export function VrmCanvas({
  modelId,
  speaking = false,
  getLevel,
  expression = null,
  controllerRef,
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
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { speakingRef.current = speaking; }, [speaking]);
  React.useEffect(() => { getLevelRef.current = getLevel; }, [getLevel]);
  React.useEffect(() => { expressionRef.current = expression; }, [expression]);

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

    const token = getManagedToken();
    const vrmUrl = token
      ? `/api/vrm-avatars/${fileRef}/file?token=${encodeURIComponent(token)}`
      : `/api/vrm-avatars/${fileRef}/file`;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      vrmUrl,
      (gltf) => {
        if (disposed) return;
        const vrm = gltf.userData.vrm as import('@pixiv/three-vrm').VRM | undefined;
        if (!vrm) { setError('VRM 解析失败'); return; }

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);
        VRMUtils.rotateVRM0(vrm);

        vrm.scene.traverse((o) => { o.frustumCulled = false; });
        scene.add(vrm.scene);

        // 创建 VrmController（会立即应用 relax pose + 选 idle/tap clip + 起 mixer）
        const controller = new VrmController(
          vrm,
          gltf.animations,
          renderer,
          scene,
          camera,
        );
        controllerRefInternal.current = controller;
        if (controllerRef) controllerRef.current = controller;

        // gaze 跟随：把 mouse 相对 canvas 的归一化位置喂给 controller
        const onPointerMove = (e: PointerEvent) => {
          const r = host.getBoundingClientRect();
          const nx = (e.clientX - r.left) / r.width * 2 - 1;
          const ny = (e.clientY - r.top) / r.height * 2 - 1;
          controller.setGaze(nx, ny);
        };
        host.addEventListener('pointermove', onPointerMove);

        let raf = 0;
        const animate = () => {
          if (disposed) return;
          raf = requestAnimationFrame(animate);
          // props → controller 桥接
          if (expressionRef.current) controller.setExpression(expressionRef.current);
          controller.update(speakingRef.current, () => getLevelRef.current?.() ?? 0);
        };
        animate();

        // 等第一次拿到正确的 host 尺寸再 fit——GLTFLoader callback 里 host 可能还没 layout
        let fitted = false;
        const resize = () => {
          const w = host.offsetWidth || host.clientWidth;
          const h = host.offsetHeight || host.clientHeight;
          if (!w || !h) return; // 还没 layout，跳过
          renderer.setSize(w, h, true); // updateStyle=true，让 three.js 直接设 canvas CSS
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          // 第一次拿到有效尺寸时做 fitVrmToCamera（只做一次）
          if (!fitted) {
            fitted = true;
            fitVrmToCamera(vrm, camera, host);
            controller.captureBaseScale(); // fit 后同步 controller 内的 baseSceneScale
          }
        };
        const observer = new ResizeObserver(resize);
        observer.observe(host);
        resize();

        setReady(true);

        return () => {
          disposed = true;
          cancelAnimationFrame(raf);
          observer.disconnect();
          host.removeEventListener('pointermove', onPointerMove);
          controller.dispose();
          VRMUtils.deepDispose(vrm.scene);
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
          controllerRefInternal.current = null;
          if (controllerRef && controllerRef.current === controller) {
            controllerRef.current = null;
          }
        };
      },
      undefined,
      (err) => {
        if (!disposed) setError(err instanceof Error ? err.message : String(err));
      },
    );

    return () => {
      disposed = true;
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

function fitVrmToCamera(
  vrm: import('@pixiv/three-vrm').VRM,
  camera: THREE.PerspectiveCamera,
  host: HTMLElement,
) {
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const size = box.getSize(new THREE.Vector3());

  // 1) 先把模型底部对齐 y=0（脚踩地面）
  vrm.scene.position.y -= box.min.y;

  // 2) 模型原始尺寸
  const modelHeight = size.y;
  const modelWidth = size.x;

  // 3) 相机参数（必须用 offsetWidth/Height——clientWidth 在某些布局下为 0）
  const fovRad = (camera.fov * Math.PI) / 180;
  const hostH = host.offsetHeight || host.clientHeight || 400;
  const hostW = host.offsetWidth || host.clientWidth || 300;
  const aspect = hostW / hostH;

  // 4) 目标：模型完整显示，上下留 8% padding
  const targetPadding = 0.08;
  const targetVisibleRatio = 1 - targetPadding * 2; // 模型占视野的 84%

  // 4a) 固定距离 3m（VRM 世界单位下的合理观察距离）
  const targetDistance = 3.0;
  const visibleH = 2 * Math.tan(fovRad / 2) * targetDistance;
  const visibleW = visibleH * aspect;

  // 4b) 让模型高度等于 visibleH * targetVisibleRatio，算 scale
  const scaleFromHeight = (visibleH * targetVisibleRatio) / modelHeight;
  const scaleFromWidth = (visibleW * 0.95) / modelWidth;
  const scale = Math.min(scaleFromHeight, scaleFromWidth);

  // 4c) 应用 scale
  vrm.scene.scale.set(scale, scale, scale);

  // 5) 相机对准缩放后的模型中心
  const newBox = new THREE.Box3().setFromObject(vrm.scene);
  const newCenter = newBox.getCenter(new THREE.Vector3());
  camera.position.set(newCenter.x, newCenter.y, newCenter.z + targetDistance);
  camera.lookAt(newCenter);
  camera.updateProjectionMatrix();
}
