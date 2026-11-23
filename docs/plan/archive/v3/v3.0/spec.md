# P4 M0b 运行时补齐 Spec

> 阶段：P4（M0b）
> 目标：原位换模型不闪窗、资源可审计回收、Q 版运行时可开关。
> 前置：P2 内容库、P3 剧本接线已完成；门禁（单文件 ≤300 行 / 目录直接文件 ≤12 / check:cycles）继续生效。

## 1. 范围与验收

| 编号 | 交付 | 验收 |
|---|---|---|
| P4-1a | Web 运行时拆出 VrmSession，模型热替换不重建 renderer | 连续切 3 个模型无黑帧、无 canvas 叠加、控制器引用指向新模型 |
| P4-1b | 桌面同窗口换模型 IPC（超时回退重建窗口） | 换模型窗口位置/穿透/悬停状态保留；渲染层未应答时自动回退旧逻辑 |
| P4-2 | 资源回收审计 | `__vrmDebug.resources()` 在换模型后回到基线（几何/纹理/程序数不随切换次数增长）；释放顺序固定 |
| P4-3 | Q 版开关（设置 + 运行时） | 开关即时生效；Q 版下取景脚底仍贴底、坐姿锚点正确；关闭可还原 |

## 2. 现状结论（已经核实，不再重复调研）

- `vrm-canvas.tsx` 唯一 effect 依赖 `[fileRef]`；cleanup 会销毁 controller、`VRMUtils.deepDispose`、`renderer.dispose()+forceContextLoss()`、移除 canvas → 换模型必黑帧。
- `vrm-fit.ts` 的 `createCanvasFit` 内部 `fitted` 只首帧 `primeForFit()`，无重置入口；`fitVrmToCamera` 先归零 scale/position 再按 bounds 取景，幂等。
- `VrmController.dispose()` 只 `mixer.dispose()`；renderer/scene 由 canvas cleanup 统一处理。
- `VrmSeating` 构造时 `captureRig()` 测髋高/腿长；缩放骨架后必须重测，否则坐面/下沉错。
- 桌面 `PetManager.open()` 不同模型走 `swapModel()`：销毁旧 BrowserWindow 再新建；模型经 `/pet?model=` query 传入；`pet-ipc.ts` 是纯注册表，身份校验在 manager。
- `apps/web/src/app/pet/page.tsx` 只在 mount 读一次 query，无换模型通道。
- `apps/web/src/features/avatar/vrm/` 直接文件已 12 个（含 2 个 test），**新文件必须进子目录**（`session/`、`chibi/`）。

## 3. P4-1a Web：VrmSession 热替换

### 3.1 新增 `apps/web/src/features/avatar/vrm/session/vrm-session.ts`

```ts
export interface VrmSessionDeps {
  host: HTMLElement;
  getPetSize(): 'sm' | 'md' | 'lg';
  getRuntime(): {
    speaking: boolean;
    level(): number;
    mood: MotionMood;
    relationshipLevel: number;
    frameMode: FrameMode;
    sleeping: boolean;
    faceAway: boolean;
    expression: ExpressionTag | null;
    chibi: boolean;
  };
  onController(controller: VrmController | null): void;
  onReady(ready: boolean): void;
  onError(message: string | null): void;
  onModelRect(rect: AvatarScreenRect | null): void;
  onFrame?(dtMs: number): void;
}

export function createVrmSession(deps: VrmSessionDeps): {
  loadModel(fileRef: string): Promise<void>;
  refit(): void;
  resources(): { geometries: number; textures: number; programs: number };
  dispose(): void;
};
```

职责与时序：

1. 创建一次 scene / camera / renderer / lights / canvas / `attachGazePointer` / `createCanvasFit` / 单条 rAF（无模型时只空转，不渲染）。
2. `loadModel(fileRef)`：
   - `token = ++swapToken`；加载 `GLTFLoader + VRMLoaderPlugin + VRMAnimationLoaderPlugin`；
   - 预处理与原实现一致：`removeUnnecessaryVertices / combineSkeletons / removeUnnecessaryJoints / rotateVRM0`、`frustumCulled = false`；
   - `loadMotionPool(loader, vrm)` + `loadRotationConfig()`；
   - 构造新 `VrmController`，并应用 `getRuntime()` 的 sleeping / faceAway / expression / chibi；
   - **新模型 ready 后才释放旧模型**（同一同步块内，rAF 不会插入），顺序固定：
     `controller.dispose()` → `removeVrmDebugProbe(old)` → `scene.remove(oldVrm.scene)` → `VRMUtils.deepDispose(oldVrm.scene)` → `scene.add(newVrm.scene)`；
   - `installVrmDebugProbe(...)`（含 `resources`）；`fit.reset(); fit.refit();`；`onController(next)`；`onReady(true)`。
   - 过期 token（期间又切了模型 / 已 dispose）：丢弃新加载结果并 `VRMUtils.deepDispose(gltf.scene)`。
3. 失败策略：当前无模型 → `onError(message)`；已有模型 → 只在 dev 打日志，保留旧模型继续显示，不覆盖错误层。
4. `resources()` 返回 `renderer.info.memory.geometries / textures` 与 `renderer.info.programs.length`。
5. `dispose()`：停 rAF、observer 由 canvas 侧断、解绑 gaze、释放当前模型（同顺序）、`fit.dispose()`、`renderer.dispose()+forceContextLoss()`、移除 canvas。

### 3.2 修改 `apps/web/src/features/avatar/vrm/vrm-fit.ts`

`createCanvasFit` 返回值增加 `reset()`：清 `fitted / bounds / fitW / fitH`（保留 `lastW/lastH`，避免 ResizeObserver 尺寸短路）。`refit()` 在 reset 后走 `apply()` → 新 controller 的 `primeForFit()`。

### 3.3 修改 `apps/web/src/features/avatar/vrm/vrm-canvas.tsx`

- 保留全部 props 与 refs（speaking/mood/relationship/frameMode/sleeping/faceAway/expression/petSize/chibi/onModelRect/onFrame）。
- effect #1（mount 一次）：`createVrmSession`，`ResizeObserver(fit.resize)`，cleanup 调 `session.dispose()`；不再依赖 `fileRef`。
- effect #2（依赖 `[fileRef, session]`）：`session?.loadModel(fileRef)`。
- `petSize` / `chibi` 变化：更新 ref 后 `session.refit()`；`chibi` 同时 `controller.setChibi()`。
- `controllerRefInternal` 由 `onController` 写入；`controllerRef`（外部）同步置空/替换。
- `ready/error` 状态由 session 回调维护，加载遮罩逻辑不变。

### 3.4 新增 `apps/web/src/features/avatar/vrm/session/release-model.ts`

纯函数 `releaseVrmModel({ controller, vrm, scene, probe })`：按固定顺序释放并幂等；供 session 与单测共用。

## 4. P4-1b 桌面：同窗口换模型

| 文件 | 改动 |
|---|---|
| `packages/shared/src/pet.ts` | `WbfmPetBridge` 增加 `onModelChange(cb): () => void`（桌宠窗订阅）与 `confirmModel(modelId): void`（应用后回执） |
| `apps/desktop/src/main/pet/pet-constants.ts` | 新增 `MODEL_CHANGED_CHANNEL = 'pet:model-changed'`、`MODEL_APPLIED_CHANNEL = 'pet:model-applied'` |
| `apps/desktop/src/preload/index.ts` | 桥接两通道：`onModelChange` 用 `subscribe`，`confirmModel` 用 `send` |
| `apps/desktop/src/main/pet/pet-ipc.ts` | `PetIpcActions` 增加 `confirmModel(modelId)`；新增 `ipc.on('pet:model-applied')`，仅 `fromPet` 放行且参数为字符串 |
| `apps/desktop/src/main/pet/pet-manager.ts` | `swapModel` 改为先 IPC：发送 `pet:model-changed` 并等待回执（默认 1500ms，可注入 `setTimeout/clearTimeout`）；收到匹配 modelId 的 `confirmModel` → `currentModelId = target`；超时/发送异常 → 回退 `recreateWindow(target)`（原销毁重建逻辑原样保留） |
| `apps/desktop/src/main/pet/pet-types.ts` | `PetManagerDeps` 增加可选 `setTimeout/clearTimeout` |
| `apps/web/src/app/pet/page.tsx` | 订阅 `onModelChange`：`setModelId(normalizeAvatarModelId(next))` → `confirmModel(id)` → `history.replaceState` 同步 query |

约束：

- 换模型仍不广播 `pet:open-changed`、不唤主窗。
- `handleClosed / prepareQuit / resetAfterClose` 需取消 pending 回执，避免超时后重建已关闭窗口。
- 回执只表示「渲染层已接受切换」，不代表模型加载成功；加载失败由 VrmSession 保留旧模型。

## 5. P4-2 资源回收审计

- `vrm-session.ts` 的 `releaseVrmModel` 为唯一释放入口，顺序与 §3.1 一致。
- `vrm-debug.ts`：`VrmDebugProbe` 增加 `resources: () => { geometries; textures; programs }`；`installVrmDebugProbe` 增加可选 `getResources` 参数。
- 单测 `vrm/session/release-model.test.ts`：用最小假对象断言调用顺序、幂等（二次调用不重复 dispose）。

## 6. P4-3 Q 版开关

| 层 | 文件 | 改动 |
|---|---|---|
| Schema | `packages/shared/src/schemas/media/voice.ts` | update schema 增加可选 `avatarChibi: boolean`；`voiceSettingsSchema.required` 与 `DEFAULT_VOICE_SETTINGS` 增加 `avatarChibi: false` |
| i18n | `packages/shared/src/i18n/messages/voice.ts`、`voice-en.ts` | `voice.avatar.chibiLabel` / `chibiHint` |
| 设置页 | `apps/web/src/features/voice/settings/avatar-section.tsx` | 在桌宠大小下方加开关（`Switch`），`onPatch({ avatarChibi })` |
| 运行时 | 新增 `apps/web/src/features/avatar/vrm/chibi/apply-chibi.ts` | `applyChibi(vrm, on)` 幂等：`head.scale ×1.35`、`leftUpperLeg/rightUpperLeg.scale ×0.7`，首次记录原值到 `vrm.scene.userData`，off 时还原 |
| 姿态层 | `vrm/overlay/vrm-seating.ts` | 增加公开 `refreshRig()`：重新 `captureRig()` |
| 姿态层 | `vrm/vrm-pose-layer.ts` | 增加 `setChibi(on)`：`applyChibi` + `seating.refreshRig()` |
| 控制器 | `vrm/vrm-controller.ts` | 增加 `setChibi(on)`：`pose.setChibi(on)` + `captureBaseScale()` |
| 画布 | `vrm/vrm-canvas.tsx` | 新增 prop `chibi?: boolean`；effect 下发 controller 并 `refit()`；新模型在 session 内应用当前值 |
| 路由 | `avatar/ui/avatar-canvas-router.tsx` | props 透传 `chibi` |
| 取数 | 新增 `apps/web/src/features/avatar/ui/settings/use-avatar-chibi.ts`（子目录避免目录文件上限；若 `avatar/ui` 未达上限可平铺） | `useVisibleQuery` 读 voiceSettings，返回 `data?.avatarChibi === true` |
| 接线 | `avatar/ui/avatar-host.tsx`、`pet/pet-stage.tsx` | 传 `chibi`（pet-stage 可直接用现有 `useSettings()` 数据） |

脚底回正依赖 `fitVrmToCamera` 的 bottom 对齐：Q 版切换后必须 `refit()`，不额外改相机。

## 7. 测试

- 新增 `vrm/session/release-model.test.ts`：释放顺序 + 幂等。
- 新增 `vrm/chibi/apply-chibi.test.ts`：最小 `VRM` 假件（humanoid 返回假骨骼节点），断言缩放、二次 apply 不叠加、关闭还原。
- 更新 `apps/desktop/src/main/pet/pet-manager.test.ts`：
  - 换模型不再销毁窗口：断言 `webContents.send('pet:model-changed', target)`，回执后 `createWindow` 仍为 1 次且 `currentModelId` 更新；
  - 超时回退：触发注入的 setTimeout 回调后走重建路径（原断言迁移到此用例）。
- `pet-fixtures` 如需捕获发送即可，不新增依赖。

## 8. 门禁

- `pnpm --filter @wbfm/web test -- src/features/avatar/vrm src/features/avatar/ui`
- `pnpm --filter @wbfm/desktop test -- src/main/pet`
- `pnpm typecheck`
- `pnpm --filter @wbfm/web lint`
- `pnpm check:lines` / `pnpm check:structure` / `pnpm check:cycles`
- 真机：桌宠连续切 3 个模型（含内置雪团 ↔ 导入模型），无黑帧/无窗口位移；`__vrmDebug.resources()` 回基线；Q 版开/关各一次并截图。

## 9. 明确不做

- 不改 Live2D 换模型路径（仍由 React remount 承担）。
- 不做 Q 版专用骨骼/资产；仅骨骼缩放 + 取景回正。
- 不改动作池加载策略、不改 Director/行为库。
- 不新增第二套 renderer 或离屏预加载缓存。
