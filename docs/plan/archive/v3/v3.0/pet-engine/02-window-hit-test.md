# 02 窗口与命中：从矩形到模型轮廓

> 结论：命中精度是当前桌宠「手感差」的第一根因。用渲染层生成的屏幕空间多边形替代固定比例矩形，
> 主进程只做轻量 point-in-polygon；窗口坐立/任务栏作为第二阶段能力。

## 1. 现状与问题

`apps/desktop/src/main/pet/pet-window.ts`：

```ts
export const PET_HIT_DIP = {
  leftRatio: 0.15,
  rightRatio: 0.85,
  topRatio: 0.11,
} as const;
```

这是一个**矩形**：窗口宽 260、高 340 DIP，命中区约 182×303 DIP。后果：

- 角色两侧的透明区域也会被判定为「悬停」，穿透被关闭，点击落在空白处；
- 角色头发/尾巴伸出矩形时无法交互；
- 角色很瘦时，矩形中央仍可点击，观感「空气也能点」。

Mate-Engine 的做法是**射线命中 + 透明窗点击穿透**：`UniWindowController` 每帧从光标发一条射线，命中模型层才关闭 `WS_EX_TRANSPARENT`；`HitTestType` 支持 `Opacity` 与 `Raycast` 两种模式。

## 2. 推荐方案：代理多边形

### 2.1 数据来源

渲染层在以下时机生成并上报（归一化 0..1，原点窗口左上）：

- 模型首次加载完成；
- 窗口尺寸/模型缩放变化；
- 切换模型；
- Q 版/体型参数变化。

多边形来源按优先级：

1. Live2D：官方 `hitAreas`（Head/Body 等）+ 画布变换矩阵；
2. VRM：头部/躯干/尾巴骨骼包围盒投影到屏幕，取凸包或简化轮廓；
3. 兜底：模型整体包围盒。

### 2.2 契约

```ts
type PetHitPolygon = {
  id: 'head' | 'body' | 'tail';
  points: Array<[number, number]>; // 0..1，窗口坐标，顺时针
};

type PetHitProxy = {
  version: 1;
  width: number;
  height: number;
  polygons: PetHitPolygon[];
};
```

主进程把归一化点乘窗口 bounds 得到 DIP 坐标，再做射线法判定：

```ts
export function pointInPolygon(
  x: number,
  y: number,
  points: Array<[number, number]>,
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
```

性能：3 个多边形、每个 ≤ 24 个点，60 Hz 轮询下开销可忽略（微秒级）。

### 2.3 穿透滞回保持不变

现有 `PetClickThroughController` 的策略是对的，只把输入从「矩形命中」换成「多边形命中」：

- 进入命中区：立即 `setIgnoreMouseEvents(false)`；
- 离开：延迟 180 ms 再穿透，期间回到命中区则取消；
- 拖拽/右键菜单：强制可交互；
- 隐藏/最小化：不翻转。

### 2.4 可选：像素级 alpha 命中

如果多边形仍不够贴合（例如发丝、尾巴尖端），可在模型加载后做一次 **64×64 离屏 alpha 采样**：

1. 渲染到 `WebGLRenderTarget`；
2. `gl.readPixels` 读 alpha；
3. 生成位图掩码，上报给主进程；
4. 主进程按 DIP 映射查表。

只在加载/缩放时做一次，不进入每帧循环。可作为 P2 优化，不作为 P0。

## 3. 坐标与 DPI

必须遵守的现有经验（已在 `pet-drag-controller.ts` 验证）：

- 只用 **DIP**：`screen.getCursorScreenPoint()`、`win.getBounds()`、`win.setBounds()`；
- 拖拽全程用固定尺寸 `setBounds`，不能读回 `getBounds().width/height`——透明置顶窗跨 DPI 移动时 Windows 会按物理像素取整，读回会「棘轮式」变大；
- 多屏 `workArea` clamp，拔屏/改分辨率回落到主屏；
- 渲染层 `clientX/Y` 是 CSS 像素，不要直接与 `screenX/Y` 混用。

命中多边形同样归一化，主进程乘当前 bounds，天然适配 DPI 与窗口尺寸变化。

## 4. 拖拽与抛掷

保留现有实现，补两点：

1. **拖动中强制可交互**，并暂停命中翻转；
2. **松手速度采样**用 100 ms 窗口、80 ms 陈旧阈值（现有实现），避免「停住再松手」被误判为抛掷。

Mate-Engine 的拖拽细节可借鉴：

- 拖拽开始后需持续 ≥ 1 s 才允许「坐窗口」，防止路过窗口顶边就吸附；
- 解除吸附后 0.3 s 冷却，避免抖动；
- 吸附位置用 0.12 s 平滑，限速 6000 px/s。

## 5. 窗口坐立与任务栏（P1）

这是「从贴纸变成在场」感知最强的能力。Mate-Engine 用 Win32 枚举窗口，找到角色髋部附近的窗口顶边并吸附。

### 5.1 需要的能力

| 能力 | Win32 API | Electron 接入 |
|---|---|---|
| 枚举顶层窗口 | `EnumWindows` | `node-window-manager` 或 `koffi` FFI |
| 窗口矩形 | `GetWindowRect` / `DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)` | 同上 |
| 前台窗口 | `GetForegroundWindow` | 同上 |
| 类名/标题 | `GetClassName` / `GetWindowText` | 同上 |
| 进程过滤 | `GetWindowThreadProcessId` | 排除自身 PID |
| 任务栏区域 | `screen.getPrimaryDisplay().workArea` | Electron `screen` |

### 5.2 过滤规则

枚举时跳过：

- 自身窗口与 PID；
- 不可见、零尺寸、最小化；
- 工具窗/无激活窗（`WS_EX_TOOLWINDOW`、`WS_EX_NOACTIVATE`）；
- 全透明分层窗（Mate 的 `layeredAlphaIgnoreBelow = 230` 思路：alpha 低于阈值视为不可见）；
- 桌面/任务栏本身（单独处理）。

### 5.3 吸附算法

```text
每 15 fps（待机 8 fps）枚举一次候选窗口
取角色髋部世界坐标，向上/向下各探 24 px
若窗口顶边落在探测带内，且拖拽已持续 ≥ 1 s：
  记录目标窗口、顶边 Y、水平重叠区间
  角色切换到 sit 动作，位置平滑到顶边
离开顶边 > 16 px 或窗口消失：解除吸附，0.3 s 冷却
```

参数来自 Mate-Engine：`probeRadiusPx=24`、`probeGuardPx=240`、`snapSmoothingTime=0.12`、`windowEnumFPS=15`、`windowEnumIdleFPS=8`。

### 5.4 任务栏坐立

任务栏等价于「工作区边缘」：

- 任务栏在底部：`workArea.bottom < display.bounds.bottom`，坐 `workArea.bottom`；
- 顶部/左侧/右侧同理；
- 自动隐藏任务栏：轮询 `workArea` 变化，或监听前台窗口变化后重新计算；
- 坐到任务栏时用单独的 `sit-taskbar` 动作与更低的 Z 偏移，避免遮住图标。

### 5.5 遮挡与全屏

Electron 无法像 Unity 那样为每个窗口生成遮挡网格。务实策略：

- 桌宠始终保持 `screen-saver` 层级；
- 检测到前台全屏独占应用（窗口矩形 == 显示器矩形）时，自动隐藏或降帧；
- 不做「被窗口遮住一半」的逐像素遮挡，收益低、复杂度高。

## 6. 验收

| 项 | 目标 |
|---|---|
| 命中误判 | 角色轮廓外点击穿透成功率 ≥ 99% |
| 边缘抖动 | 指针沿轮廓移动 10 s，穿透翻转 ≤ 2 次 |
| 命中延迟 | 进入命中区到可点击 ≤ 16 ms |
| DPI | 100%/125%/150%/200% 下命中偏差 ≤ 2 DIP |
| 多屏 | 主副屏来回拖动 20 次，尺寸不漂移 |
| 坐立 | 拖到窗口顶边 1 s 内吸附，离开 0.3 s 解除 |
| 任务栏 | 四方向任务栏均可坐，不遮挡图标 |

## 7. 风险

- Win32 FFI 仅 Windows；macOS 需 AXUIView/Accessibility，Linux 需 X11/Wayland 分支，P1 只做 Windows，其他平台降级为「不坐窗口」。
- `setIgnoreMouseEvents(true, { forward: true })` 的 mousemove 在 Windows 下不可靠，继续用主进程轮询，不要回退到渲染层判定。
- 窗口枚举有性能与权限风险（管理员窗口、UWP 窗口），失败必须静默降级。
