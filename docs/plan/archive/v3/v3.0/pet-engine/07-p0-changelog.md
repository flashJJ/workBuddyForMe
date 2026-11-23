# 07 P0 变更摘要：多边形命中 + 帧率三档

> 对应 [README.md](./README.md) §6 的 P0 前两项；落点分支 `feat/v3.0-fat-fish`（未提交）。
> 目标：先解决桌宠「空气可点 / 边缘穿透错乱」与「常驻全速渲染」两个手感与占用问题，不引入新依赖。

## 1. 变更总览

| 层 | 变更 | 结果 |
|---|---|---|
| 共享契约 | 新增 `PetHitPolygon` / `PetHitProxy` / 射线法 / IPC 净化 | 渲染层与主进程共用一套轮廓协议 |
| 渲染层 | Live2D 量 PIXI 包围盒、VRM 投影 `Box3`，生成站姿轮廓并上报 | 命中区贴合模型，不再按窗口比例 |
| 主进程 | 悬停轮询改为轮廓优先、矩形回落 | 轮廓外直接点穿桌面 |
| 渲染层 | 新增 `FrameMode` 三档与桌宠档位 hook | 交互 60 / 待机 30 / 隐藏 0 |
| Live2D | 控制器新增 `setMaxFps` | ticker 限帧或暂停，不再常开 |
| VRM | rAF 循环接跳帧 + `dt` 上限 | 待机 30fps，隐藏恢复不跳变 |
| 桌宠窗 | `backgroundThrottling: false` | 避免 Chromium 后台压到 1Hz |

## 2. 多边形命中

### 2.1 协议与安全边界

`packages/shared/src/pet.ts`：

- `PetHitPolygon { id: 'head' | 'body' | 'tail'; points: [number, number][] }`
- `PetHitProxy { version: 1; polygons: PetHitPolygon[] }`
- `pointInPolygon`：射线法，支持凹多边形；`isPointInPetHitProxy`：多轮廓取并集。
- `sanitizePetHitProxy`：版本必须为 1；多边形 ≤ 4、单轮廓 ≤ 32 点；非法点整条丢弃；坐标夹紧到 0..1。无有效轮廓返回 `null`。
- `WbfmPetBridge.reportHitProxy(proxy | null)`。

### 2.2 渲染层

- Live2D：`Live2dController.layout()` 用 PIXI `model.getBounds()` 得到 CSS 像素包围盒，回调 `onRect`。
- VRM：`projectObjectToViewport(vrm.scene, camera, w, h)` 把包围盒 8 个角投影到视口，取屏幕矩形。
- `features/pet/stage/hit-proxy.ts`：
  - `buildPetHitProxy(rect, viewport)` 归一化后生成 12 点站姿轮廓（头顶窄 → 肩部最宽 → 脚部收窄），切掉四角透明区；
  - `usePetHitProxy(bridge)` 去重后上报，并缓存为渲染层自身 mousemove 命中的同一份数据；
  - 渲染层 `use-pet-bridge` 的悬停上报改用 `isPetHitPointAt`，与主进程口径一致。

### 2.3 主进程

- `pet:hit-proxy`（仅桌宠窗可发）→ `PetHoverPoller.reportHitProxy` → 净化后缓存。
- `isCursorOverPet(cursor, bounds, proxy)`：先判窗口矩形，再对归一化坐标做 point-in-polygon；`proxy` 为空或无效时回落旧的 15%/85%/11% 矩形。
- 换窗/换模型时 `start()` 清空旧轮廓，首帧仍走矩形，渲染层上报后自动切换。

### 2.4 行为与回落

| 场景 | 行为 |
|---|---|
| 模型未加载完 | 矩形命中（旧行为，不退化） |
| 轮廓已上报 | 轮廓外点穿；轮廓内才关闭穿透 |
| 换模型/重建窗 | 旧轮廓清空，等待新窗上报 |
| 非法 IPC 载荷 | 丢弃并回落矩形 |
| DPI/多屏/窗口移动 | 轮廓是归一化坐标，随 bounds 自动换算 |

## 3. 帧率三档

### 3.1 档位规则

`features/avatar/performance/frame-governor.ts`：

```text
hidden   0 fps   document.visibilityState === 'hidden'
idle    30 fps   无语音且 1.5s 无指针交互
interact 60 fps  指针移动/按下，或 voiceState ≠ idle（聆听/思考/说话）
```

- `shouldRenderFrame(now, last, mode)` 用 1ms 容差跳帧，兼容 60Hz 屏的 16.6ms 帧间隔；首帧直接放行。
- `frameRateForMode(mode)` 供 PIXI ticker 使用。

### 3.2 渲染接入

- Live2D：`setMaxFps(0)` 停 ticker，`30/60` 设 `ticker.maxFPS`；口型 pump 同步按档位跳帧。
- VRM：`animate` 内按档位跳帧；`VrmController.update` 对 `dt` 做 `min(0.05s)` 上限，隐藏恢复时 SpringBone/动作不跳变。
- 桌宠页：`usePetFrameMode(voiceState)` 监听 `pointermove/pointerdown` 与 `visibilitychange`，1.5s 尾巴后回 idle。
- 桌宠窗：`webPreferences.backgroundThrottling: false`，主动暂停仍由渲染层控制。

## 4. 文件清单

| 类型 | 文件 |
|---|---|
| 新增 | `apps/web/src/features/avatar/performance/frame-governor.ts` |
| 新增 | `apps/web/src/features/avatar/performance/screen-rect.ts` |
| 新增 | `apps/web/src/features/avatar/vrm/vrm-debug.ts`（dev 探针外迁） |
| 新增 | `apps/web/src/features/pet/stage/hit-proxy.ts` |
| 新增 | `apps/web/src/features/pet/stage/use-pet-frame-mode.ts` |
| 新增 | `apps/web/src/features/pet/stage/pet-subtitle-bubble.tsx`（字幕组件外迁） |
| 修改 | `packages/shared/src/pet.ts`、`packages/shared/src/pet.test.ts` |
| 修改 | `apps/desktop/src/main/pet/{pet-window,pet-hover-poller,pet-ipc,pet-manager}.ts`、`preload/index.ts` |
| 修改 | `apps/web/src/features/avatar/{index.ts,live2d/live2d-canvas.tsx,live2d/live2d-controller.ts,live2d/live2d-stage.tsx,vrm/vrm-canvas.tsx,vrm/vrm-controller.ts}` |
| 修改 | `apps/web/src/features/pet/{pet-stage.tsx,use-pet-bridge.ts}` 及两个桥测试的 mock |

## 5. 测试与门禁

| 项 | 结果 |
|---|---|
| `pnpm check` | 通过（typecheck / lint / 行数 / 结构 / 循环 / ASCII） |
| shared 单测 | 14 项通过（含净化、射线段、凹多边形、数量截断） |
| desktop 单测 | 203 项通过（含轮廓命中、轮廓外不翻转穿透、非法轮廓回落） |
| web avatar + pet 单测 | 73 项通过（含三档跳帧、轮廓生成、2 个桥 mock 补全） |
| 文件行数 | 全部 ≤ 300；`pet-manager` 300、`live2d-controller` 299 |

## 6. 手动验收建议

1. 把指针移到角色左右两侧/头顶透明区：应直接点穿桌面，不出现「点空气」。
2. 沿角色轮廓缓慢移动 10s：穿透翻转应 ≤ 2 次，无边缘抖动。
3. 待机 1 分钟：任务管理器 CPU 明显低于改造前；指针移入角色后动作恢复顺滑。
4. 拖拽角色 30s：保持 60fps，松手抛掷/贴边正常。
5. 语音播放期间：口型与动作维持 60fps；结束后约 1.5s 掉到待机档。

## 7. 已知边界与后续

- 当前轮廓由**模型包围盒 + 站姿剖面**生成，不是逐像素 alpha；发丝/尾巴尖端仍有少量误判，必要时按 03 文档做一次 64×64 离屏 alpha 掩码（P2）。
- `hidden` 档目前只由页面 `visibilitychange` 驱动。桌宠窗关闭即销毁，暂无「主进程 hide/minimize IPC」；若后续支持隐藏到托盘/最小化，再补 `pet:presence`。
- 未做：主进程窗口/任务栏坐立、AnimationDirector、资源 dispose 审计、Q 版运行时骨骼缩放（均属 P0 后段或 P1）。
- 本摘要对应工作区变更，尚未提交 commit；回滚只需还原上述文件，矩形回落保证旧行为可用。
