'use client';

import * as React from 'react';

/**
 * v2.0 M0 spike：three.js + three-vrm 单角色渲染封装（工装版，非产品代码）。
 * 动态 import 保证 three 只进 spike chunk；暴露加载首帧耗时与口型驱动句柄。
 */

export interface VrmHandle {
  setMouthLevel: (level: number) => void;
  setExpression: (name: 'neutral' | 'joy' | 'sadness' | 'anger') => void;
  dispose: () => void;
}

export interface VrmLoadResult {
  handle: VrmHandle;
  /** 加载首帧耗时：fetch+解析+首次 render（ms） */
  firstFrameMs: number;
  vrmVersion: string;
  /** 模型包围盒（世界单位），写入报告供取景对比 */
  box: { minY: number; maxY: number; height: number };
}

/**
 * 加载并渲染 VRM。cameraX 控制角色在画面中的横向位置（混排场景用）。
 * 注意：三个 import 必须保持字面量（webpack 靠静态分析拆 chunk，
 * 变量化 import() 不会被打包，运行时即 Cannot find module）。
 */
export async function mountVrm(
  canvas: HTMLCanvasElement,
  url: string,
  cameraX = 0,
): Promise<VrmLoadResult> {
  const THREE = await import('three');
  const [{ GLTFLoader }, { VRMLoaderPlugin, VRMUtils }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('@pixiv/three-vrm'),
  ]);
  type ThreeNS = typeof THREE;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth || 1920, canvas.clientHeight || 1080, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    28,
    (canvas.clientWidth || 1920) / (canvas.clientHeight || 1080),
    0.1,
    20,
  );

  const loader = new GLTFLoader();
  loader.register((parser: unknown) => new VRMLoaderPlugin(parser as never));

  const t0 = performance.now();
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.removeUnnecessaryJoints(gltf.scene);
  scene.add(gltf.scene);

  // 包围盒驱动取景（头肩为主：取整体上部 45%）
  const box3 = new THREE.Box3().setFromObject(gltf.scene);
  const height = box3.max.y - box3.min.y;
  const headY = box3.max.y - height * 0.12;
  const camDist = 0.95;
  camera.position.set(cameraX, headY, camDist);
  camera.lookAt(cameraX, headY - height * 0.1, 0);

  // 三点柔光（默认材质无灯光时偏暗）
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(0.5, 2, 1.5);
  scene.add(key);

  let mouthLevel = 0;
  let expression: 'neutral' | 'joy' | 'sadness' | 'anger' = 'neutral';
  const clock = new THREE.Clock();
  let rafId = 0;
  let firstRendered = false;
  const firstFrameDeferred: { resolve: () => void } = { resolve: () => {} };
  const firstFramePromise = new Promise<void>((resolve) => {
    firstFrameDeferred.resolve = resolve;
  });

  const tick = () => {
    const dt = clock.getDelta();
    vrm.update(dt);
    // 口型：aa 单元音驱动（M4 产品方案的简化版）；表情权重与口型叠加
    const em = vrm.expressionManager;
    if (em) {
      em.setValue('aa', mouthLevel);
      if (expression !== 'neutral') em.setValue(expression, 0.8);
    }
    renderer.render(scene, camera);
    if (!firstRendered) {
      firstRendered = true;
      firstFrameDeferred.resolve();
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  await firstFramePromise;
  const firstFrameMs = performance.now() - t0;

  const vrmVersion = gltf.userData.vrm?.meta?.metaVersion === '1' ? '1.0' : '0.x';
  const handle: VrmHandle = {
    setMouthLevel: (level) => {
      mouthLevel = Math.max(0, Math.min(1, level));
    },
    setExpression: (name) => {
      expression = name;
    },
    dispose: () => {
      cancelAnimationFrame(rafId);
      vrm.dispose?.();
      renderer.dispose();
      gltf.scene.traverse((obj: InstanceType<ThreeNS['Object3D']>) => {
        const mesh = obj as InstanceType<ThreeNS['Mesh']>;
        if (mesh.geometry) mesh.geometry.dispose();
      });
    },
  };

  return {
    handle,
    firstFrameMs: Math.round(firstFrameMs),
    vrmVersion,
    box: { minY: Number(box3.min.y.toFixed(3)), maxY: Number(box3.max.y.toFixed(3)), height: Number(height.toFixed(3)) },
  };
}
